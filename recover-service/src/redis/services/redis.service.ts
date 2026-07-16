import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    this.client.on('error', (err) =>
      this.logger.error('RedisService: Redis error', { error: String(err) }),
    );
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  }

  async setJson(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  // Best-effort mutual exclusion (SET key val NX PX ttl). Used per-experiment so an
  // overlapping sweep tick, or another recover-service replica, can't act on the same
  // experiment concurrently — while different experiments still process in parallel.
  async acquireLock(key: string, ttlMs: number): Promise<boolean> {
    const result = await this.client.set(key, '1', 'PX', ttlMs, 'NX');
    return result === 'OK';
  }
}
