import pg from 'pg';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ENTITIES } from './entities/index.js';

/** 스키마 이름은 SQL에 그대로 들어가므로 영문 소문자·숫자·_ 만 허용한다. */
export function schemaName(): string {
  const schema = process.env.DB_SCHEMA || 'meeting_room';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`DB_SCHEMA 값이 올바르지 않아요: ${schema}`);
  }
  return schema;
}

/**
 * Render 외부 주소(호스트에 점이 있음)는 SSL이 필요하고,
 * Render 내부 주소(dpg-xxx-a)와 내 컴퓨터 DB는 SSL 없이 연결한다.
 */
function sslOption(url: string) {
  const host = new URL(url).hostname;
  const local = host === 'localhost' || host === '127.0.0.1';
  return !local && host.includes('.') ? { rejectUnauthorized: false } : false;
}

export async function typeOrmOptions(): Promise<TypeOrmModuleOptions> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('.env 에 DATABASE_URL 이 없어요.');
  const schema = schemaName();
  const ssl = sslOption(url);

  // 첫 번째 과제 테이블(public)과 섞이지 않도록 이 과제 전용 스키마를 먼저 만든다.
  const client = new pg.Client({ connectionString: url, ssl });
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  } finally {
    await client.end();
  }

  return {
    type: 'postgres',
    url,
    ssl,
    schema,
    entities: ENTITIES,
    // 이 스키마 안의 테이블만 엔티티에 맞춰 만든다. (다른 스키마는 건드리지 않음)
    synchronize: true,
  };
}
