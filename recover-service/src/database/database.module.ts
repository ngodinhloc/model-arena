import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Experiment } from './entities/experiment.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [Experiment],
        // backend owns the schema (synchronize: true there) — this service only reads/writes rows.
        synchronize: false,
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature([Experiment]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
