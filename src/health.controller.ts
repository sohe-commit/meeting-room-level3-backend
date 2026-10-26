import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Public } from './common/auth.js';
import { schemaName } from './database.js';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'disconnected',
        message: 'DB에 연결할 수 없어요.',
      });
    }
    return {
      status: 'ok',
      db: 'connected',
      schema: schemaName(),
      time: new Date().toISOString(),
    };
  }
}
