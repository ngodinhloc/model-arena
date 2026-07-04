import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Experiment } from '../database/entities/experiment.entity';
import { ExperimentManager } from './services/experiment.manager';
import { ReplayStrategy } from './services/replay.strategy';
import { RecoveryService } from './services/recovery.service';

@Module({
  imports: [TypeOrmModule.forFeature([Experiment])],
  providers: [ExperimentManager, ReplayStrategy, RecoveryService],
})
export class RecoveryModule {}
