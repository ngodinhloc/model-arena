import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { Topic } from './topic.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 200, unique: true })
  name!: string;

  @OneToMany(() => Topic, (topic) => topic.category)
  topics!: Topic[];
}
