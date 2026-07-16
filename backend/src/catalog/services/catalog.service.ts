import { Injectable } from '@nestjs/common';
import { CATEGORIES } from '../data/categories.seed';
import { PROVIDERS } from '../data/providers.seed';

export interface CategoryView {
  id: number;
  name: string;
}

export interface TopicView {
  id: number;
  categoryId: number;
  topic: string;
}

export interface ResolvedTopic {
  id: number;
  topic: string;
  categoryId: number;
  categoryName: string;
}

@Injectable()
export class CatalogService {
  getProvidersWithModels() {
    return PROVIDERS.map((p) => ({
      id: p.id,
      name: p.name,
      models: p.models.map((m) => ({ id: m.id, name: m.name })),
    }));
  }

  getCategories(): CategoryView[] {
    return CATEGORIES.map((c) => ({ id: c.id, name: c.name }));
  }

  getTopics(categoryId?: number): TopicView[] {
    return CATEGORIES.filter((c) => !categoryId || c.id === categoryId).flatMap(
      (c) =>
        c.topics.map((t) => ({ id: t.id, categoryId: c.id, topic: t.topic })),
    );
  }

  getTopic(id: number): ResolvedTopic | null {
    for (const category of CATEGORIES) {
      const topic = category.topics.find((t) => t.id === id);
      if (topic)
        return {
          id: topic.id,
          topic: topic.topic,
          categoryId: category.id,
          categoryName: category.name,
        };
    }
    return null;
  }
}
