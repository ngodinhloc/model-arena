import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Model } from './model.entity';

@Entity('providers')
export class Provider {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @OneToMany(() => Model, (model) => model.provider)
  models!: Model[];
}
