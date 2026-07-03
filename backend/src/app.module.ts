import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { RedisModule } from './redis/redis.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { CatalogModule } from './catalog/catalog.module';
import { ExperimentModule } from './experiment/experiment.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [DatabaseModule, RedisModule, RabbitMQModule, CatalogModule, ExperimentModule, HealthModule],
})
export class AppModule {}
