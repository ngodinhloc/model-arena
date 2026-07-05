import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';
import { ExperimentStatus } from '../../recovery/contracts/experiment.interface';

// Partial mirror of backend's Experiment entity — only the columns recover-service
// touches. This service runs with `synchronize: false` so it never issues DDL;
// backend remains the sole owner of the `experiments` table schema.
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
  candidateConfig!: unknown[];

  @Column({ name: 'judge_config', type: 'jsonb' })
  judgeConfig!: unknown[];

  @Column({ type: 'varchar', length: 20, default: ExperimentStatus.running })
  status!: ExperimentStatus;

  @Column({ name: 'modified_at', type: 'timestamp' })
  modifiedAt!: Date;
}
