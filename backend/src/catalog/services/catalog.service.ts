import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from '../../database/entities/provider.entity';
import { Model } from '../../database/entities/model.entity';
import { Category } from '../../database/entities/category.entity';
import { Topic } from '../../database/entities/topic.entity';
import { PROVIDER_SEED, CATEGORY_SEED } from '../seed/catalog.seed';

@Injectable()
export class CatalogService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectRepository(Provider) private readonly providerRepo: Repository<Provider>,
    @InjectRepository(Model) private readonly modelRepo: Repository<Model>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Topic) private readonly topicRepo: Repository<Topic>,
  ) {}

  async onApplicationBootstrap() {
    await this.seed();
  }

  private async seed(): Promise<void> {
    for (const [providerName, models] of Object.entries(PROVIDER_SEED)) {
      let provider = await this.providerRepo.findOne({ where: { name: providerName } });
      if (!provider) {
        provider = await this.providerRepo.save(this.providerRepo.create({ name: providerName }));
      }
      for (const modelName of models) {
        const exists = await this.modelRepo.findOne({
          where: { providerId: provider.id, name: modelName },
        });
        if (!exists) {
          await this.modelRepo.save(this.modelRepo.create({ providerId: provider.id, name: modelName }));
        }
      }
    }

    for (const [categoryName, topics] of Object.entries(CATEGORY_SEED)) {
      let category = await this.categoryRepo.findOne({ where: { name: categoryName } });
      if (!category) {
        category = await this.categoryRepo.save(this.categoryRepo.create({ name: categoryName }));
      }
      for (const topicText of topics) {
        const exists = await this.topicRepo.findOne({
          where: { categoryId: category.id, topic: topicText },
        });
        if (!exists) {
          await this.topicRepo.save(this.topicRepo.create({ categoryId: category.id, topic: topicText }));
        }
      }
    }
    this.logger.log('CatalogService.seed: catalog seeded');
  }

  async getProvidersWithModels(): Promise<{ id: number; name: string; models: { id: number; name: string }[] }[]> {
    const providers = await this.providerRepo.find({ relations: { models: true }, order: { id: 'ASC' } });
    return providers.map((p) => ({
      id: p.id,
      name: p.name,
      models: (p.models ?? []).map((m) => ({ id: m.id, name: m.name })),
    }));
  }

  getCategories(): Promise<Category[]> {
    return this.categoryRepo.find({ order: { id: 'ASC' } });
  }

  getTopics(categoryId?: number): Promise<Topic[]> {
    return this.topicRepo.find({
      where: categoryId ? { categoryId } : {},
      order: { id: 'ASC' },
    });
  }

  getTopic(id: number): Promise<Topic | null> {
    return this.topicRepo.findOne({ where: { id }, relations: { category: true } });
  }
}
