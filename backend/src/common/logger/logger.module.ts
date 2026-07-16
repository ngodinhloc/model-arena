import { Module } from '@nestjs/common';
import { AppLogger } from './services/app-logger';

@Module({
  providers: [AppLogger],
  exports: [AppLogger],
})
export class LoggerModule {}
