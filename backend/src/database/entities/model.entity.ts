import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Provider } from './provider.entity';

@Entity('models')
export class Model {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'provider_id' })
  providerId!: number;

  @ManyToOne(() => Provider, (provider) => provider.models)
  @JoinColumn({ name: 'provider_id' })
  provider!: Provider;

  @Column({ type: 'varchar', length: 200 })
  name!: string;
}
