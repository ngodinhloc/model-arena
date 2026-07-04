import { Global, Module } from '@nestjs/common';
import { RabbitMQPublisherService } from './services/rabbitmq-publisher.service';

@Global()
@Module({
  providers: [RabbitMQPublisherService],
  exports: [RabbitMQPublisherService],
})
export class RabbitMQModule {}
