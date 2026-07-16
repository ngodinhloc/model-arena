import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../../redis/services/redis.service';
import { RabbitMqClient } from '../../rabbitmq/services/rabbitmq.client';
import { CatalogService } from '../../catalog/services/catalog.service';
import { Result } from '../../database/entities/result.entity';
import { CreateExperimentDto } from '../dto/create-experiment.dto';
import {
  AgentStatus,
  CandidateConfig,
  EVENT_EXPERIMENT_CREATED,
  EXCHANGE_EXPERIMENT,
  ExperimentCache,
  ExperimentEvent,
  ExperimentItem,
  ExperimentStatus,
  JudgeConfig,
} from '../contracts/experiment.interface';
import { ExperimentRepository } from 'src/database/repositories/experiment.repository';
import { Experiment } from 'src/database/entities/experiment.entity';
import { ExperimentCacheBuilder } from '../builders/experiment-cache.builder';
import { ExperimentEventBuilder } from '../builders/expriment-event.builder';

@Injectable()
export class ExperimentService {
  constructor(
    private readonly experimentRepo: ExperimentRepository,
    @InjectRepository(Result) private readonly resultRepo: Repository<Result>,
    private readonly redisService: RedisService,
    private readonly rabbitMQService: RabbitMqClient,
    private readonly catalogService: CatalogService,
  ) {}

  redisKey(uuid: string): string {
    return `experiment:${uuid}`;
  }

  async createExperiment(dto: CreateExperimentDto): Promise<{ uuid: string }> {
    const topic = this.catalogService.getTopic(dto.topicId);
    if (!topic) throw new NotFoundException(`Topic ${dto.topicId} not found`);

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

    const experiment: Experiment = await this.experimentRepo.new(
      topic.categoryName,
      topic.topic,
      dto.rounds,
      candidateConfigs,
      judgeConfigs,
    );

    const cache: ExperimentCache = ExperimentCacheBuilder.build(experiment);
    await this.redisService.setJson(this.redisKey(experiment.uuid), cache);

    const event: ExperimentEvent = ExperimentEventBuilder.build(experiment);
    await this.rabbitMQService.publish(
      EXCHANGE_EXPERIMENT,
      EVENT_EXPERIMENT_CREATED,
      event,
    );

    return { uuid: experiment.uuid };
  }

  async listExperiments(): Promise<ExperimentItem[]> {
    const experiments = await this.experimentRepo.findAll();
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
    const experiment = await this.experimentRepo.findOneByUuid(uuid);
    if (!experiment)
      throw new NotFoundException(`Experiment ${uuid} not found`);

    const base: ExperimentItem = {
      uuid: experiment.uuid,
      topic: experiment.topic,
      category: experiment.category,
      candidateConfig: experiment.candidateConfig,
      judgeConfig: experiment.judgeConfig,
      status: experiment.status,
      createdAt: experiment.createdAt,
    };

    if (experiment.status === ExperimentStatus.running) {
      const cache = await this.redisService.getJson<ExperimentCache>(
        this.redisKey(uuid),
      );
      return {
        ...base,
        messages: cache?.messages ?? [],
        agentStatus: cache?.agentStatus ?? AgentStatus.isThinking,
      };
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
}
