import { Controller, Post, Get, Body, Param, Query, ParseUUIDPipe, ParseIntPipe } from '@nestjs/common';
import { ExperimentService } from '../services/experiment.service';
import { CreateExperimentDto } from '../dto/create-experiment.dto';

@Controller('api')
export class ExperimentController {
  constructor(private readonly experimentService: ExperimentService) {}

  @Post('experiments')
  createExperiment(@Body() dto: CreateExperimentDto): Promise<{ uuid: string }> {
    return this.experimentService.createExperiment(dto);
  }

  @Get('experiments')
  listExperiments(
    @Query('category_id', new ParseIntPipe({ optional: true })) categoryId?: number,
    @Query('topic_id', new ParseIntPipe({ optional: true })) topicId?: number,
  ) {
    return this.experimentService.listExperiments(categoryId, topicId);
  }

  @Get('analytics')
  getAnalytics() {
    return this.experimentService.getAnalytics();
  }

  @Get('experiments/:uuid')
  getExperiment(@Param('uuid', ParseUUIDPipe) uuid: string) {
    return this.experimentService.getExperiment(uuid);
  }
}
