import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from '../../database/entities/provider.entity';
import { Category } from '../../database/entities/category.entity';
import { Topic } from '../../database/entities/topic.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Provider) private readonly providerRepo: Repository<Provider>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Topic) private readonly topicRepo: Repository<Topic>,
  ) {}

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
