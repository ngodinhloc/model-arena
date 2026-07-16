import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Result } from 'src/database/entities/result.entity';
import { ExperimentRepository } from 'src/database/repositories/experiment.repository';
import { RedisService } from 'src/redis/services/redis.service';
import { AppLogger } from 'src/common/logger/services/app-logger';
import {
  ExperimentCache,
  ExperimentStatus,
  Message,
  ScoreResponse,
} from 'src/experiment/contracts/experiment.interface';
import { EventHandler } from '../contracts/event.interfaces';
import { ExperimentEvent } from '../../experiment/contracts/experiment.interface';

@Injectable()
export class ScoreRespondedHandler implements EventHandler {
  constructor(
    private readonly experimentRepo: ExperimentRepository,
    @InjectRepository(Result) private readonly resultRepo: Repository<Result>,
    private readonly redisService: RedisService,
    private readonly logger: AppLogger,
  ) {}

  async handle(event: ExperimentEvent): Promise<void> {
    const uuid = event.experimentId;
    if (!uuid) {
      this.logger.warn('ScoreRespondedHandler.handle: missing experimentId');
      return;
    }

    const experiment = await this.experimentRepo.findOneByUuid(uuid);
    if (!experiment) {
      this.logger.warn('ScoreRespondedHandler.handle: experiment not found', {
        uuid,
      });
      return;
    }

    const key = this.redisKey(uuid);
    const cache = await this.redisService.getJson<ExperimentCache>(key);
    const messages: Message[] = cache?.messages ?? event.messages ?? [];

    const candidateResponse = messages.filter((m) => m.node === 'candidate');
    const judgeResponse = messages.filter((m) => m.node === 'judge');
    const scoreMessage = messages.find((m) => m.node === 'score');
    const scoreResponse = (scoreMessage?.response ??
      null) as ScoreResponse | null;

    await this.resultRepo.save(
      this.resultRepo.create({
        experimentId: experiment.id,
        candidateResponse,
        judgeResponse,
        scoreResponse: scoreResponse ?? {},
      }),
    );

    experiment.status = ExperimentStatus.completed;
    await this.experimentRepo.save(experiment);

    this.logger.log('ScoreRespondedHandler.handle: experiment completed', {
      experimentId: uuid,
    });
  }

  private redisKey(uuid: string): string {
    return `experiment:${uuid}`;
  }
}
