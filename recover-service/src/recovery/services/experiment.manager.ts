import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Experiment } from '../../database/entities/experiment.entity';
import { RedisService } from '../../redis/services/redis.service';
import { ExperimentCache, ExperimentStatus } from '../contracts/experiment.interface';

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
    @InjectRepository(Experiment) private readonly experimentRepo: Repository<Experiment>,
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
    await this.redisService.setJson(this.redisKey(cache.experimentId), cache, CACHE_TTL_SECONDS);
  }

  async findRunning(): Promise<Experiment[]> {
    return this.experimentRepo.find({ where: { status: ExperimentStatus.running } });
  }

  async markFailed(experiment: Experiment): Promise<void> {
    await this.experimentRepo.update({ id: experiment.id }, { status: ExperimentStatus.failed });
  }
}
