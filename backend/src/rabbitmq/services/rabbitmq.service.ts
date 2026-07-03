import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';

type MessageHandler = (payload: Record<string, unknown>) => Promise<void>;

interface Subscription {
  exchange: string;
  queue: string;
  routingKey: string;
  handler: MessageHandler;
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private pendingSubscriptions: Subscription[] = [];

  async onModuleInit() {
    const url = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672/';
    await this.connect(url);
    for (const sub of this.pendingSubscriptions) {
      await this.bindSubscription(sub);
    }
    this.pendingSubscriptions = [];
  }

  private async connect(url: string, attempt = 1): Promise<void> {
    const maxAttempts = 10;
    try {
      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      this.logger.log('RabbitMQService.connect: Connected to RabbitMQ');
    } catch (err) {
      if (attempt >= maxAttempts) throw err;
      const delay = Math.min(1000 * attempt, 10000);
      this.logger.warn(`RabbitMQService.connect: RabbitMQ not ready, retrying in ${delay}ms…`, {
        attempt,
        maxAttempts,
      });
      await new Promise((r) => setTimeout(r, delay));
      return this.connect(url, attempt + 1);
    }
  }

  async onModuleDestroy() {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publish(exchange: string, routingKey: string, payload: unknown): Promise<void> {
    if (!this.channel) {
      this.logger.error('RabbitMQService.publish: channel not ready', { exchange, routingKey });
      return;
    }
    await this.channel.assertExchange(exchange, 'topic', { durable: true });
    this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
    });
    this.logger.log('RabbitMQService.publish: Published', { exchange, routingKey });
  }

  // Register a consumer; if the connection is not up yet the binding is deferred to onModuleInit.
  async subscribe(exchange: string, queue: string, routingKey: string, handler: MessageHandler): Promise<void> {
    const sub: Subscription = { exchange, queue, routingKey, handler };
    if (!this.channel) {
      this.pendingSubscriptions.push(sub);
      return;
    }
    await this.bindSubscription(sub);
  }

  private async bindSubscription({ exchange, queue, routingKey, handler }: Subscription): Promise<void> {
    if (!this.channel) return;
    await this.channel.assertExchange(exchange, 'topic', { durable: true });
    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.bindQueue(queue, exchange, routingKey);
    await this.channel.consume(queue, (msg) => {
      if (!msg) return;
      void (async () => {
        try {
          const payload = JSON.parse(msg.content.toString()) as Record<string, unknown>;
          await handler(payload);
          this.channel?.ack(msg);
        } catch (err) {
          this.logger.error('RabbitMQService.consume: handler failed', {
            exchange,
            queue,
            error: String(err),
          });
          this.channel?.nack(msg, false, false);
        }
      })();
    });
    this.logger.log('RabbitMQService.subscribe: Consuming', { exchange, queue, routingKey });
  }
}
