import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import * as amqp from 'amqplib';

@Injectable()
export class RabbitMQPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQPublisherService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;

  async onModuleInit() {
    const url =
      process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672/';
    await this.connect(url);
  }

  private async connect(url: string, attempt = 1): Promise<void> {
    const maxAttempts = 10;
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      this.logger.log(
        'RabbitMQPublisherService.connect: Connected to RabbitMQ',
      );
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      const delay = Math.min(1000 * attempt, 10000);
      this.logger.warn(
        `RabbitMQPublisherService.connect: RabbitMQ not ready, retrying in ${delay}ms…`,
        { attempt, maxAttempts },
      );
      await new Promise((r) => setTimeout(r, delay));
      return this.connect(url, attempt + 1);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publish(
    exchange: string,
    routingKey: string,
    payload: unknown,
  ): Promise<void> {
    if (!this.channel) {
      this.logger.error('RabbitMQPublisherService.publish: channel not ready', {
        exchange,
        routingKey,
      });
      return;
    }
    await this.channel.assertExchange(exchange, 'topic', { durable: true });
    this.channel.publish(
      exchange,
      routingKey,
      Buffer.from(JSON.stringify(payload)),
      {
        persistent: true,
      },
    );
    this.logger.log('RabbitMQPublisherService.publish: Published', {
      exchange,
      routingKey,
    });
  }
}
