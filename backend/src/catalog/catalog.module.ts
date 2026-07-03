import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './controllers/catalog.controller';
import { CatalogService } from './services/catalog.service';
import { Provider } from '../database/entities/provider.entity';
import { Model } from '../database/entities/model.entity';
import { Category } from '../database/entities/category.entity';
import { Topic } from '../database/entities/topic.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Provider, Model, Category, Topic])],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
