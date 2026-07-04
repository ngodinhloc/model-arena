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
    for (const result of results) {
      const score = result.scoreResponse;
      if (!score?.candidateScores) continue;
      for (const cs of score.candidateScores) {
        const key = `${cs.provider}/${cs.model}`;
        const stats = modelStats.get(key) ?? { wins: 0, battles: 0, totalScore: 0 };
        stats.battles += 1;
        stats.totalScore += cs.score;
        // The arbiter LLM always picks a definitive winner, even on tied totals.
        const isWinner = score.winner === `Candidate ${cs.candidateNumber}`;
        if (isWinner) stats.wins += 1;
        modelStats.set(key, stats);
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
    };
  }
}
