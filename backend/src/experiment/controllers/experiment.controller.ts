import { Controller, Post, Get, Body, Param, ParseUUIDPipe } from '@nestjs/common';
import { ExperimentService } from '../services/experiment.service';
import { AnalyticsService } from '../services/analytics.service';
import { RecoverService } from '../services/recover.service';
import { CreateExperimentDto } from '../dto/create-experiment.dto';
import { TestRecoverDto } from '../dto/test-recover.dto';

@Controller('api')
export class ExperimentController {
  constructor(
    private readonly experimentService: ExperimentService,
    private readonly analyticsService: AnalyticsService,
    private readonly recoverService: RecoverService,
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

  @Post('test-recover')
  testRecover(@Body() dto: TestRecoverDto) {
    return this.recoverService.testRecover(dto);
  }
}
