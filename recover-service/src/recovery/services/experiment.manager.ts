import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Experiment } from '../../database/entities/experiment.entity';
import { RedisService } from '../../redis/services/redis.service';
import {
  AgentStatus,
  EVENT_EXPERIMENT_CREATED,
  ExperimentCache,
  ExperimentStatus,
  SCORE_CARD_MAX_POINT,
  SCORE_CARD_NAMES,
} from '../contracts/experiment.interface';

const CACHE_TTL_SECONDS = 7200;

// Locked per-experiment so an overlapping sweep tick, or another recover-service replica,
// can't act on the same experiment concurrently — while different experiments still
// process in parallel.
const LOCK_TTL_MS = 20_000;

// Owns all Postgres/Redis access for a given experiment — mirrors the ExperimentManager
// pattern used by the candidate/judge/score agents, so RecoveryService only holds
// recovery-specific orchestration logic.
@Injectable()
export class ExperimentManager {
  constructor(
    @InjectRepository(Experiment)
    private readonly experimentRepo: Repository<Experiment>,
    private readonly redisService: RedisService,
  ) {}

  private redisKey(uuid: string): string {
    return `experiment:${uuid}`;
  }

  private lockKey(uuid: string): string {
    return `recover:sweep:lock:${uuid}`;
  }

  async acquireLock(uuid: string): Promise<boolean> {
    return this.redisService.acquireLock(this.lockKey(uuid), LOCK_TTL_MS);
  }

  async loadCache(uuid: string): Promise<ExperimentCache | null> {
    return this.redisService.getJson<ExperimentCache>(this.redisKey(uuid));
  }

  async saveCache(cache: ExperimentCache): Promise<void> {
    await this.redisService.setJson(
      this.redisKey(cache.experimentId),
      cache,
      CACHE_TTL_SECONDS,
    );
  }

  async findRunning(): Promise<Experiment[]> {
    return this.experimentRepo.find({
      where: { status: ExperimentStatus.running },
    });
  }

  async markFailed(experiment: Experiment): Promise<void> {
    await this.experimentRepo.update(
      { id: experiment.id },
      { status: ExperimentStatus.failed },
    );
  }

  // Redis had nothing at all for this experiment (cache missing/expired) — rebuild a
  // brand-new cache from the Postgres row, exactly as backend's createExperiment would have
  // written it, so replaying it re-kicks off the pipeline from scratch instead of giving up.
  buildFreshCache(experiment: Experiment): ExperimentCache {
    return {
      eventName: EVENT_EXPERIMENT_CREATED,
      experimentId: experiment.uuid,
      category: experiment.category,
      topic: experiment.topic,
      rounds: experiment.rounds,
      candidateConfigs: experiment.candidateConfig,
      judgeConfigs: experiment.judgeConfig,
      scoreCards: SCORE_CARD_NAMES.map((cardName) => ({
        cardName,
        maxPoint: SCORE_CARD_MAX_POINT,
      })),
      messages: [],
      agentStatus: AgentStatus.isThinking,
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    };
  }
}
