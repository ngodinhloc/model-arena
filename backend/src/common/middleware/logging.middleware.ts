import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppLogger } from '../logger/services/app-logger';

const SKIP_LOGGING_PATHS = ['/api/health'];

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: AppLogger,
  ) {
  }

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl } = req;
    const start = Date.now();

    res.on('finish', () => {
      if (SKIP_LOGGING_PATHS.includes(originalUrl)) return;
      const ms = Date.now() - start;
      this.logger.log(`${method} ${originalUrl} ${res.statusCode} ${ms}ms`);
    });

    next();
  }
}
