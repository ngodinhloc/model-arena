import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Topic } from './topic.entity';
import { CandidateConfig, JudgeConfig, ExperimentStatus } from '../../experiment/contracts/experiment.interface';

@Entity('experiments')
export class Experiment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  uuid!: string;

  @Column({ name: 'topic_id' })
  topicId!: number;

  @ManyToOne(() => Topic)
  @JoinColumn({ name: 'topic_id' })
  topic!: Topic;

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
