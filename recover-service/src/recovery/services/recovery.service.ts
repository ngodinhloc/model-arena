import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Experiment } from '../../database/entities/experiment.entity';
import { ExperimentManager } from './experiment.manager';
import { ReplayStrategy } from './replay.strategy';
import { AgentStatus } from '../contracts/experiment.interface';

const STALE_THRESHOLD_MS = parseInt(process.env.STALE_THRESHOLD_SECONDS ?? '120', 10) * 1000;
const SWEEP_INTERVAL_MS = parseInt(process.env.SWEEP_INTERVAL_SECONDS ?? '30', 10) * 1000;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? '3', 10);
const SWEEP_CONCURRENCY = 25;

// Decides *whether* a running experiment is stale and, if so, whether to retry it or give
// up — the actual replay mechanics live in ReplayStrategy.
@Injectable()
export class RecoveryService {
  private readonly logger = new Logger(RecoveryService.name);

  constructor(
    private readonly experimentManager: ExperimentManager,
    private readonly replayStrategy: ReplayStrategy,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async sweep(): Promise<void> {
    const runningExperiments = await this.experimentManager.findRunning();

    for (let i = 0; i < runningExperiments.length; i += SWEEP_CONCURRENCY) {
      const batch = runningExperiments.slice(i, i + SWEEP_CONCURRENCY);
      await Promise.all(batch.map((experiment) => this.checkExperiment(experiment)));
    }
  }

  // Promise.all: one experiment throwing would otherwise abort the whole batch immediately.
  private async checkExperiment(experiment: Experiment): Promise<void> {
    try {
      const gotLock = await this.experimentManager.acquireLock(experiment.uuid);
      if (!gotLock) return;

      const cache = await this.experimentManager.loadCache(experiment.uuid);

      if (!cache) {
        this.logger.warn('RecoveryService.checkExperiment: cache missing/expired, marking failed', {
          uuid: experiment.uuid,
        });
        await this.experimentManager.markFailed(experiment);
        return;
      }

      const ageMs = Date.now() - Date.parse(cache.updatedAt);
      if (ageMs < STALE_THRESHOLD_MS) return; // still legitimately in progress

      if (cache.retryCount >= MAX_RETRIES) {
        this.logger.warn('RecoveryService.checkExperiment: retries exhausted, marking failed', {
          uuid: experiment.uuid,
        });
        await this.experimentManager.markFailed(experiment);
        return;
      }

      if (cache.agentStatus === AgentStatus.hasReplied) {
        await this.replayStrategy.replayStalledFinal(cache);
        return;
      }

      await this.replayStrategy.replayStalledStage(cache);
    } catch (err) {
      this.logger.error('RecoveryService.checkExperiment: check failed', {
        uuid: experiment.uuid,
        error: String(err),
      });
    }
  }
}
