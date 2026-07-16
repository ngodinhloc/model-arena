import { LoggerService } from '@nestjs/common';

const LEVEL_LABELS: Record<string, string> = {
  log: 'INFO',
  error: 'ERROR',
  warn: 'WARN',
  debug: 'DEBUG',
  verbose: 'VERBOSE',
};

export class AppLogger implements LoggerService {
  private readonly isProd: boolean;
  private readonly serviceName: string;

  constructor() {
    this.isProd = process.env.APP_ENV === 'PROD';
    this.serviceName = process.env.SERVICE_NAME ?? 'backend';
  }

  private write(
    level: string,
    message: string,
    context?: object,
    stack?: object,
  ): void {
    const data: Record<string, unknown> = {};
    if (context && typeof context === 'object') Object.assign(data, context);
    if (stack) data.stack = stack;

    if (this.isProd) {
      const logEntry = this.formatProdLog(level, message, data);
      process.stdout.write(JSON.stringify(logEntry) + '\n');
    } else {
      const logMessage = this.formatDevLog(level, message, data);
      process.stdout.write(logMessage + '\n');
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

  private formatProdLog(
    level: string,
    message: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      '@timestamp': new Date().toISOString(),
      'log.level': level.toUpperCase(),
      message,
      'service.name': this.serviceName,
      ...data,
    };
  }

  private formatDevLog(
    level: string,
    message: string,
    data: Record<string, unknown>,
  ): string {
    const label = LEVEL_LABELS[level] ?? level;
    const ctx = Object.keys(data).length > 0 ? ` ${JSON.stringify(data)}` : '';
    return `[${label}] ${message}${ctx}`;
  }
}
