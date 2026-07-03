import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { CatalogService } from '../services/catalog.service';

@Controller('api')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('models')
  getModels() {
    return this.catalogService.getProvidersWithModels();
  }

  @Get('categories')
  getCategories() {
    return this.catalogService.getCategories();
  }

  @Get('topics')
  getTopics(@Query('category_id', new ParseIntPipe({ optional: true })) categoryId?: number) {
    return this.catalogService.getTopics(categoryId);
  }
}
