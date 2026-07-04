import { Controller, Post, Get, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ExperimentService } from '../services/experiment.service';
import { AnalyticsService } from '../services/analytics.service';
import { CreateExperimentDto } from '../dto/create-experiment.dto';

@Controller('api')
export class ExperimentController {
  constructor(
    private readonly experimentService: ExperimentService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Post('experiments')
  createExperiment(@Body() dto: CreateExperimentDto): Promise<{ uuid: string }> {
    return this.experimentService.createExperiment(dto);
  }

  @Get('experiments')
  listExperiments() {
    return this.experimentService.listExperiments();
  }

  @Get('analytics')
  getAnalytics() {
    return this.analyticsService.getAnalytics();
  }

  @Get('experiments/:uuid')
  getExperiment(@Param('uuid', ParseUUIDPipe) uuid: string) {
    return this.experimentService.getExperiment(uuid);
  }
}
