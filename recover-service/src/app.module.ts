import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { RecoveryModule } from './recovery/recovery.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, RedisModule, RabbitMQModule, RecoveryModule, HealthModule],
})
export class AppModule {}
