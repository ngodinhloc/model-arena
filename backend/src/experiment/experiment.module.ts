import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExperimentController } from './controllers/experiment.controller';
import { ExperimentService } from './services/experiment.service';
import { AnalyticsService } from './services/analytics.service';
import { EventService } from './services/event.service';
import { ExperimentGateway } from './gateways/experiment.gateway';
import { Experiment } from '../database/entities/experiment.entity';
import { Result } from '../database/entities/result.entity';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [TypeOrmModule.forFeature([Experiment, Result]), CatalogModule],
  controllers: [ExperimentController],
  providers: [ExperimentService, AnalyticsService, EventService, ExperimentGateway],
})
export class ExperimentModule {}
