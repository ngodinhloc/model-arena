import { Module } from '@nestjs/common';
import { LoggerModule } from '../common/logger/logger.module';
import { DatabaseModule } from '../database/database.module';
import { ScoreRespondedHandler } from './handlers/score-responded.handler';
import { EVENT_REGISTRY, createEventRegistry } from './configs/event.config';
import { MessageProcessor } from './services/message.processor';
import { ExperimentModule } from 'src/experiment/experiment.module';
import { RabbitMqConsumer } from './services/rabbitmq.consumer';

@Module({
  imports: [DatabaseModule, LoggerModule, ExperimentModule],
  controllers: [],
  providers: [
    ScoreRespondedHandler,
    MessageProcessor,
    RabbitMqConsumer,
    {
      provide: EVENT_REGISTRY,
      useFactory: createEventRegistry,
      inject: [ScoreRespondedHandler],
    },
  ],
  exports: [
    EVENT_REGISTRY,
    ScoreRespondedHandler,
    MessageProcessor,
    RabbitMqConsumer,
  ],
})
export class EventModule {}
