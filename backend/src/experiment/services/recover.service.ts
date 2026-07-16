import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../../redis/services/redis.service';
import { Experiment } from '../../database/entities/experiment.entity';
import { Result } from '../../database/entities/result.entity';
import {
  StalledExperimentItem,
  StallState,
  TestRecoverDto,
} from '../dto/test-recover.dto';
import {
  AgentStatus,
  CandidateConfig,
  EVENT_EXPERIMENT_CREATED,
  ExperimentCache,
  ExperimentStatus,
  Message,
  SCORE_CARD_MAX_POINT,
  SCORE_CARD_NAMES,
} from '../contracts/experiment.interface';

// Comfortably past any reasonable STALE_THRESHOLD_SECONDS (recover-service defaults to
// 120s) so a simulated stall is picked up on the very first sweep tick.
const STALL_BACKDATE_MS = 10 * 60 * 1000;

@Injectable()
export class RecoverService {
  constructor(
    @InjectRepository(Experiment)
    private readonly experimentRepo: Repository<Experiment>,
    @InjectRepository(Result) private readonly resultRepo: Repository<Result>,
    private readonly redisService: RedisService,
  ) {}

  redisKey(uuid: string): string {
    return `experiment:${uuid}`;
  }

  // Recovery testing: clones N random completed experiments as fresh "running" ones with
  // messages stripped back to just before the given stage, then backdates the Redis cache
  // so recover-service's sweep finds them already stale and replays the stuck stage —
  // without ever publishing to RabbitMQ (that's what would make a real agent pick it up).
  async testRecover(dto: TestRecoverDto): Promise<StalledExperimentItem[]> {
    const sources = await this.experimentRepo
      .createQueryBuilder('e')
      .where('e.status = :status', { status: ExperimentStatus.completed })
      .orderBy('RANDOM()')
      .limit(dto.count)
      .getMany();

    const created: StalledExperimentItem[] = [];

    for (const source of sources) {
      const result = await this.resultRepo.findOne({
        where: { experimentId: source.id },
        order: { createdAt: 'DESC' },
      });
      if (!result) continue;

      const uuid = uuidv4();
      const experiment = this.buildExperimentEntity(source, uuid);
      await this.experimentRepo.save(experiment);

      const cache = this.buildExperimentCache(
        source,
        uuid,
        dto.stallState,
        result,
      );
      await this.redisService.setJson(this.redisKey(uuid), cache);

      created.push(this.buildStallExperiment(source, uuid, dto.stallState));
    }

    return created;
  }

  private buildStallExperiment(
    source: Experiment,
    uuid: string,
    stallState: StallState,
  ): StalledExperimentItem {
    return {
      uuid,
      topic: source.topic,
      category: source.category,
      stallState,
      candidate1: this.toCandidateSummary(source.candidateConfig, 1),
      candidate2: this.toCandidateSummary(source.candidateConfig, 2),
    };
  }

  private buildExperimentEntity(source: Experiment, uuid: string): Experiment {
    return this.experimentRepo.create({
      uuid,
      category: source.category,
      topic: source.topic,
      rounds: source.rounds,
      candidateConfig: source.candidateConfig,
      judgeConfig: source.judgeConfig,
      status: ExperimentStatus.running,
    });
  }

  private buildExperimentCache(
    source: Experiment,
    uuid: string,
    stallState: StallState,
    result: Result,
  ): ExperimentCache {
    return {
      eventName: EVENT_EXPERIMENT_CREATED,
      experimentId: uuid,
      category: source.category,
      topic: source.topic,
      rounds: source.rounds,
      candidateConfigs: source.candidateConfig,
      judgeConfigs: source.judgeConfig,
      scoreCards: SCORE_CARD_NAMES.map((cardName) => ({
        cardName,
        maxPoint: SCORE_CARD_MAX_POINT,
      })),
      messages: this.stripMessagesByStallState(
        stallState,
        result.candidateResponse,
        result.judgeResponse,
      ),
      agentStatus: AgentStatus.isThinking,
      updatedAt: new Date(Date.now() - STALL_BACKDATE_MS).toISOString(),
      retryCount: 0,
    };
  }

  private stripMessagesByStallState(
    stallState: StallState,
    candidateResponse: Message[],
    judgeResponse: Message[],
  ): Message[] {
    switch (stallState) {
      case 'candidate':
        return [];
      case 'judge':
        return [...candidateResponse];
      case 'score':
        return [...candidateResponse, ...judgeResponse];
    }
  }

  private toCandidateSummary(
    configs: CandidateConfig[],
    candidateNumber: 1 | 2,
  ) {
    const config = configs.find((c) => c.candidateNumber === candidateNumber);
    return { provider: config?.provider ?? '', model: config?.model ?? '' };
  }
}
