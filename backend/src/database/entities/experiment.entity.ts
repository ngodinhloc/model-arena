import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CandidateConfig, JudgeConfig, ExperimentStatus } from '../../experiment/contracts/experiment.interface';

@Entity('experiments')
export class Experiment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  uuid!: string;

  @Column({ type: 'varchar', length: 200 })
  category!: string;

  @Column({ type: 'varchar', length: 500 })
  topic!: string;

  @Column({ type: 'smallint' })
  rounds!: number;

  @Column({ name: 'candidate_config', type: 'jsonb' })
  candidateConfig!: CandidateConfig[];

  @Column({ name: 'judge_config', type: 'jsonb' })
  judgeConfig!: JudgeConfig[];

  @Column({ type: 'varchar', length: 20, default: ExperimentStatus.running })
  status!: ExperimentStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'modified_at' })
  modifiedAt!: Date;
}
