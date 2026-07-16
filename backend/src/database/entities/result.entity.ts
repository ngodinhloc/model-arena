import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Experiment } from './experiment.entity';
import {
  Message,
  ScoreResponse,
} from '../../experiment/contracts/experiment.interface';

@Entity('results')
export class Result {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column({ name: 'experiment_id' })
  experimentId!: number;

  @ManyToOne(() => Experiment)
  @JoinColumn({ name: 'experiment_id' })
  experiment!: Experiment;

  @Column({ name: 'candidate_response', type: 'jsonb' })
  candidateResponse!: Message[];

  @Column({ name: 'judge_response', type: 'jsonb' })
  judgeResponse!: Message[];

  @Column({ name: 'score_response', type: 'jsonb' })
  scoreResponse!: ScoreResponse;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
