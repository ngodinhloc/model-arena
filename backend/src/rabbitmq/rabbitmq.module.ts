import { Global, Module } from '@nestjs/common';
import { RabbitMqClient } from './services/rabbitmq.client';
import { LoggerModule } from 'src/common/logger/logger.module';

@Global()
@Module({
  providers: [RabbitMqClient],
  exports: [RabbitMqClient],
  imports: [LoggerModule],
})
export class RabbitMQModule {}
