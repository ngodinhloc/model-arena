import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../redis/services/redis.service';
import { RabbitMQService } from '../../rabbitmq/services/rabbitmq.service';
import { CatalogService } from '../../catalog/services/catalog.service';
import { Experiment } from '../../database/entities/experiment.entity';
import { Result } from '../../database/entities/result.entity';
import { CreateExperimentDto } from '../dto/create-experiment.dto';
import {
  AgentStatus,
  CandidateConfig,
  EVENT_EXPERIMENT_CREATED,
  EXCHANGE_EXPERIMENT,
  ExperimentCache,
  ExperimentStatus,
  JudgeConfig,
  JudgeScoreSheet,
  SCORE_CARD_MAX_POINT,
  SCORE_CARD_NAMES,
} from '../contracts/experiment.interface';

@Injectable()
export class ExperimentService {
  constructor(
    @InjectRepository(Experiment) private readonly experimentRepo: Repository<Experiment>,
    @InjectRepository(Result) private readonly resultRepo: Repository<Result>,
    private readonly redisService: RedisService,
    private readonly rabbitMQService: RabbitMQService,
    private readonly catalogService: CatalogService,
  ) {}

  redisKey(uuid: string): string {
    return `experiment:${uuid}`;
  }

  async createExperiment(dto: CreateExperimentDto): Promise<{ uuid: string }> {
    const topic = await this.catalogService.getTopic(dto.topicId);
    if (!topic) throw new NotFoundException(`Topic ${dto.topicId} not found`);

    const uuid = uuidv4();
    const candidateConfigs: CandidateConfig[] = dto.candidates.map((c) => ({
      candidateNumber: c.number,
      provider: c.provider,
      model: c.model,
      persona: dto.candidatePersona,
      temperature: c.temperature,
    }));
    const judgeConfigs: JudgeConfig[] = dto.judges.map((j) => ({
      judgeNumber: j.number,
      provider: j.provider,
      model: j.model,
      persona: dto.judgePersona,
      temperature: j.temperature,
    }));

    const experiment = this.experimentRepo.create({
      uuid,
      category: topic.categoryName,
      topic: topic.topic,
      rounds: dto.rounds,
      candidateConfig: candidateConfigs,
      judgeConfig: judgeConfigs,
      status: ExperimentStatus.running,
    });
    await this.experimentRepo.save(experiment);

    const cache: ExperimentCache = {
      eventName: EVENT_EXPERIMENT_CREATED,
      experimentId: uuid,
      category: topic.categoryName,
      topic: topic.topic,
      rounds: dto.rounds,
      candidateConfigs,
      judgeConfigs,
      scoreCards: SCORE_CARD_NAMES.map((cardName) => ({ cardName, maxPoint: SCORE_CARD_MAX_POINT })),
      messages: [],
      agentStatus: AgentStatus.isThinking,
    };
    await this.redisService.setJson(this.redisKey(uuid), cache);

    const { messages: _messages, agentStatus: _agentStatus, ...event } = cache;
    await this.rabbitMQService.publish(EXCHANGE_EXPERIMENT, EVENT_EXPERIMENT_CREATED, event);

    return { uuid };
  }

  async listExperiments() {
    const experiments = await this.experimentRepo.find({ order: { createdAt: 'DESC' } });
    return experiments.map((e) => ({
      uuid: e.uuid,
      topic: e.topic,
      category: e.category,
      candidateConfig: e.candidateConfig,
      judgeConfig: e.judgeConfig,
      status: e.status,
      createdAt: e.createdAt,
    }));
  }

  async getExperiment(uuid: string) {
    const experiment = await this.experimentRepo.findOne({ where: { uuid } });
    if (!experiment) throw new NotFoundException(`Experiment ${uuid} not found`);

    const base = {
      uuid: experiment.uuid,
      topic: experiment.topic,
      category: experiment.category,
      candidateConfig: experiment.candidateConfig,
      judgeConfig: experiment.judgeConfig,
      status: experiment.status,
      createdAt: experiment.createdAt,
    };

    if (experiment.status === ExperimentStatus.running) {
      const cache = await this.redisService.getJson<ExperimentCache>(this.redisKey(uuid));
      return { ...base, messages: cache?.messages ?? [], agentStatus: cache?.agentStatus ?? AgentStatus.isThinking };
    }

    const result = await this.resultRepo.findOne({
      where: { experimentId: experiment.id },
      order: { createdAt: 'DESC' },
    });
    return {
      ...base,
      messages: [
        ...(result?.candidateResponse ?? []),
        ...(result?.judgeResponse ?? []),
      ],
      scoreResponse: result?.scoreResponse ?? null,
      agentStatus: AgentStatus.hasReplied,
    };
  }

  async getAnalytics() {
    const results = await this.resultRepo.find({ relations: { experiment: true } });

    const modelStats = new Map<string, { wins: number; battles: number; totalScore: number }>();
    const categoryStats = new Map<string, Map<string, { wins: number; battles: number }>>();
    const cardStats = new Map<string, { maxPoint: number; model: string }>();
    const cardWinnerStats = new Map<string, Map<string, { wins: number; battles: number }>>();

    for (const result of results) {
      const score = result.scoreResponse;
      if (!score?.candidateScores) continue;

      const category = result.experiment.category;
      const candidateModels = new Map<number, string>();

      for (const cs of score.candidateScores) {
        const key = `${cs.provider}/${cs.model}`;
        candidateModels.set(cs.candidateNumber, key);

        const stats = modelStats.get(key) ?? { wins: 0, battles: 0, totalScore: 0 };
        stats.battles += 1;
        stats.totalScore += cs.score;
        // The arbiter LLM always picks a definitive winner, even on tied totals.
        const isWinner = score.winner === `Candidate ${cs.candidateNumber}`;
        if (isWinner) stats.wins += 1;
        modelStats.set(key, stats);

        const catMap = categoryStats.get(category) ?? new Map<string, { wins: number; battles: number }>();
        const catStat = catMap.get(key) ?? { wins: 0, battles: 0 };
        catStat.battles += 1;
        if (isWinner) catStat.wins += 1;
        catMap.set(key, catStat);
        categoryStats.set(category, catMap);
      }

      const cardTotals = new Map<number, Map<string, number>>();

      for (const msg of result.judgeResponse ?? []) {
        if (msg.node !== 'judge' || !msg.response) continue;
        for (const sheet of msg.response as JudgeScoreSheet[]) {
          const model = candidateModels.get(sheet.candidateNumber) ?? `Candidate ${sheet.candidateNumber}`;
          const totals = cardTotals.get(sheet.candidateNumber) ?? new Map<string, number>();
          for (const card of sheet.cards) {
            const best = cardStats.get(card.cardName);
            if (!best || card.point > best.maxPoint) {
              cardStats.set(card.cardName, { maxPoint: card.point, model });
            }
            totals.set(card.cardName, (totals.get(card.cardName) ?? 0) + card.point);
          }
          cardTotals.set(sheet.candidateNumber, totals);
        }
      }

      // Sum each judge's per-card points per candidate, then the higher total wins that card for this battle.
      const totals1 = cardTotals.get(1);
      const totals2 = cardTotals.get(2);
      const model1 = candidateModels.get(1);
      const model2 = candidateModels.get(2);
      if (totals1 && totals2 && model1 && model2) {
        const cardNames = new Set([...totals1.keys(), ...totals2.keys()]);
        for (const cardName of cardNames) {
          const p1 = totals1.get(cardName) ?? 0;
          const p2 = totals2.get(cardName) ?? 0;
          const cardMap = cardWinnerStats.get(cardName) ?? new Map<string, { wins: number; battles: number }>();
          const s1 = cardMap.get(model1) ?? { wins: 0, battles: 0 };
          const s2 = cardMap.get(model2) ?? { wins: 0, battles: 0 };
          s1.battles += 1;
          s2.battles += 1;
          if (p1 > p2) s1.wins += 1;
          else if (p2 > p1) s2.wins += 1;
          cardMap.set(model1, s1);
          cardMap.set(model2, s2);
          cardWinnerStats.set(cardName, cardMap);
        }
      }
    }

    return {
      totalExperiments: results.length,
      models: [...modelStats.entries()]
        .map(([model, s]) => ({
          model,
          wins: s.wins,
          battles: s.battles,
          winRate: s.battles ? Math.round((s.wins / s.battles) * 100) : 0,
          avgScore: s.battles ? Math.round(s.totalScore / s.battles) : 0,
        }))
        .sort((a, b) => b.winRate - a.winRate),
      categoryWinners: [...categoryStats.entries()].map(([category, catMap]) => ({
        category,
        models: [...catMap.entries()]
          .map(([model, s]) => ({ model, wins: s.wins, battles: s.battles }))
          .sort((a, b) => b.wins - a.wins),
      })),
      scoreCards: SCORE_CARD_NAMES.filter((cardName) => cardStats.has(cardName)).map((cardName) => {
        const best = cardStats.get(cardName)!;
        return { cardName, maxPoint: best.maxPoint, maxPossible: SCORE_CARD_MAX_POINT, model: best.model };
      }),
      scoreCardWinners: SCORE_CARD_NAMES.filter((cardName) => cardWinnerStats.has(cardName)).map((cardName) => ({
        cardName,
        models: [...cardWinnerStats.get(cardName)!.entries()]
          .map(([model, s]) => ({ model, wins: s.wins, battles: s.battles }))
          .sort((a, b) => b.wins - a.wins),
      })),
    };
  }
}
