import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/services/redis.service';
import { RabbitMQService } from '../../rabbitmq/services/rabbitmq.service';
import { Experiment } from '../../database/entities/experiment.entity';
import { Result } from '../../database/entities/result.entity';
import {
  EVENT_SCORES_RESPONDED,
  EXCHANGE_SCORES,
  ExperimentCache,
  ExperimentStatus,
  Message,
  SCORES_QUEUE,
  ScoreResponse,
} from '../contracts/experiment.interface';

// Grace period so the WS gateway delivers the final cache state before cleanup.
const REDIS_CLEANUP_DELAY_MS = 5000;

@Injectable()
export class EventService implements OnModuleInit {
  private readonly logger = new Logger(EventService.name);

  constructor(
    @InjectRepository(Experiment) private readonly experimentRepo: Repository<Experiment>,
    @InjectRepository(Result) private readonly resultRepo: Repository<Result>,
    private readonly redisService: RedisService,
    private readonly rabbitMQService: RabbitMQService,
  ) {}

  async onModuleInit() {
    await this.rabbitMQService.subscribe(
      EXCHANGE_SCORES,
      SCORES_QUEUE,
      EVENT_SCORES_RESPONDED,
      (payload) => this.handleScoresResponded(payload),
    );
  }

  private async handleScoresResponded(payload: Record<string, unknown>): Promise<void> {
    const uuid = payload.experimentId as string | undefined;
    if (!uuid) {
      this.logger.warn('EventService.handleScoresResponded: missing experimentId');
      return;
    }

    const experiment = await this.experimentRepo.findOne({ where: { uuid } });
    if (!experiment) {
      this.logger.warn('EventService.handleScoresResponded: experiment not found', { uuid });
      return;
    }

    const key = `experiment:${uuid}`;
    const cache = await this.redisService.getJson<ExperimentCache>(key);
    const messages: Message[] = cache?.messages ?? (payload.messages as Message[]) ?? [];

    const candidateResponse = messages.filter((m) => m.node === 'candidate');
    const judgeResponse = messages.filter((m) => m.node === 'judge');
    const scoreMessage = messages.find((m) => m.node === 'score');
    const scoreResponse = (scoreMessage?.response ?? null) as ScoreResponse | null;

    await this.resultRepo.save(
      this.resultRepo.create({
        experimentId: experiment.id,
        candidateResponse,
        judgeResponse,
        scoreResponse: scoreResponse ?? ({} as ScoreResponse),
      }),
    );

    experiment.status = ExperimentStatus.completed;
    await this.experimentRepo.save(experiment);

    setTimeout(() => {
      this.redisService.del(key).catch(() => {});
    }, REDIS_CLEANUP_DELAY_MS);

    this.logger.log('EventService.handleScoresResponded: experiment completed', { uuid });
  }
}
