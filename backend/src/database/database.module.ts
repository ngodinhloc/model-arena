import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Experiment } from './entities/experiment.entity';
import { Result } from './entities/result.entity';
import { ExperimentRepository } from './repositories/experiment.repository';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [Experiment, Result],
        synchronize: true,
        logging: false,
      }),
    }),
    TypeOrmModule.forFeature([Experiment, Result]),
  ],
  providers: [ExperimentRepository],
  exports: [TypeOrmModule, ExperimentRepository],
})
export class DatabaseModule {}
