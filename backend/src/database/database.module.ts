import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Provider } from './entities/provider.entity';
import { Model } from './entities/model.entity';
import { Category } from './entities/category.entity';
import { Topic } from './entities/topic.entity';
import { Experiment } from './entities/experiment.entity';
import { Result } from './entities/result.entity';
import { SeedProvidersModels1783036800000 } from './migrations/1783036800000-SeedProvidersModels';
import { SeedCategoriesTopics1783036800001 } from './migrations/1783036800001-SeedCategoriesTopics';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: [Provider, Model, Category, Topic, Experiment, Result],
        migrations: [SeedProvidersModels1783036800000, SeedCategoriesTopics1783036800001],
        migrationsRun: true,
        synchronize: true,
        logging: false,
      }),
    }),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
