import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExperimentController } from './controllers/experiment.controller';
import { ExperimentService } from './services/experiment.service';
import { AnalyticsService } from './services/analytics.service';
import { RecoverService } from './services/recover.service';
import { ExperimentGateway } from './gateways/experiment.gateway';
import { Experiment } from '../database/entities/experiment.entity';
import { Result } from '../database/entities/result.entity';
import { CatalogModule } from '../catalog/catalog.module';
import { LoggerModule } from 'src/common/logger/logger.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Experiment, Result]),
    DatabaseModule,
    CatalogModule,
    LoggerModule,
  ],
  controllers: [ExperimentController],
  providers: [
    ExperimentService,
    AnalyticsService,
    RecoverService,
    ExperimentGateway,
  ],
})
export class ExperimentModule {}
