import { v4 as uuidv4 } from 'uuid';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Experiment } from '../entities/experiment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import {
  CandidateConfig,
  JudgeConfig,
} from 'src/experiment/contracts/experiment.interface';
import { ExperimentStatus } from 'src/experiment/contracts/experiment.interface';

@Injectable()
export class ExperimentRepository {
  constructor(
    @InjectRepository(Experiment) private readonly repo: Repository<Experiment>,
  ) {}

  async findOneByUuid(uuid: string): Promise<Experiment | null> {
    return this.repo.findOne({ where: { uuid } });
  }

  async findAll(): Promise<Experiment[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async new(
    category: string,
    topic: string,
    rounds: number,
    candidateConfig: CandidateConfig[],
    judgeConfig: JudgeConfig[],
  ): Promise<Experiment> {
    const experiment = this.repo.create({
      uuid: uuidv4(),
      category,
      topic,
      rounds,
      candidateConfig,
      judgeConfig,
      status: ExperimentStatus.running,
    });

    return this.repo.save(experiment);
  }

  async save(experiment: Experiment): Promise<Experiment> {
    return this.repo.save(experiment);
  }
}
