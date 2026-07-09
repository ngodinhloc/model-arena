import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMqClient } from '../../rabbitmq/services/rabbitmq.client';
import {
  EVENT_SCORES_RESPONDED,
  EXCHANGE_SCORES,
  BACKEND_QUEUE,
} from '../contracts/event.interfaces';
import { MessageProcessor } from 'src/event/services/message.processor';


@Injectable()
export class RabbitMqConsumer implements OnModuleInit {
  constructor(
    private readonly messageProcessor: MessageProcessor,
    private readonly rabbitMqClient: RabbitMqClient,
  ) {}

  async onModuleInit() {
    await this.rabbitMqClient.subscribe(
      EXCHANGE_SCORES,
      BACKEND_QUEUE,
      EVENT_SCORES_RESPONDED,
      (payload) => this.messageProcessor.process(payload),
    );
  }
}
