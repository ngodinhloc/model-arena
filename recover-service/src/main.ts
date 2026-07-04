import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLogger } from './common/logger/app-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new AppLogger() });
  app.getHttpAdapter().getInstance().disable('etag');

  const port = parseInt(process.env.PORT ?? '8000', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`Recover-service listening on port ${port}`);
}

bootstrap();
