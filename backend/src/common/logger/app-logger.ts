import { LoggerService } from '@nestjs/common';

const IS_PROD = process.env.APP_ENV === 'PROD';
const SERVICE_NAME = process.env.SERVICE_NAME ?? 'backend';

const LEVEL_LABELS: Record<string, string> = {
  log: 'INFO',
  error: 'ERROR',
  warn: 'WARN',
  debug: 'DEBUG',
  verbose: 'VERBOSE',
};

export class AppLogger implements LoggerService {
  private write(level: string, message: string, context?: object, stack?: object): void {
    const data: Record<string, unknown> = {};
    if (context && typeof context === 'object') Object.assign(data, context);
    if (stack) data.stack = stack;

    if (IS_PROD) {
      const entry = {
        '@timestamp': new Date().toISOString(),
        'log.level': level.toUpperCase(),
        message,
        'service.name': SERVICE_NAME,
        ...data,
      };
      process.stdout.write(JSON.stringify(entry) + '\n');
    } else {
      const label = LEVEL_LABELS[level] ?? level;
      const ctx = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
      process.stdout.write(`[${label}] ${message}${ctx}\n`);
    }
  }

  log(message: string, context?: object): void {
    this.write('log', message, context);
  }

  error(message: string, context?: object, stack?: object): void {
    this.write('error', message, context, stack);
  }

  warn(message: string, context?: object): void {
    this.write('warn', message, context);
  }

  debug(message: string, context?: object): void {
    this.write('debug', message, context);
  }

  verbose(message: string, context?: object): void {
    this.write('verbose', message, context);
  }
}
