import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { todayKst } from '../common/time.js';
import { schemaName } from '../database.js';

/** 한 사람이 하루(한국 날짜)에 AI 예약을 쓸 수 있는 횟수 (R16) */
export const AI_DAILY_LIMIT = 50;

export interface AiUsageView {
  used: number;
  limit: number;
}

@Injectable()
export class AiUsageService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * GPT를 부르기 전에 오늘 횟수를 1 올린다. 이미 다 썼으면 막는다.
   * 동시에 여러 번 보내도 한도를 넘지 않도록 DB에서 한 번에 검사하고 올린다.
   */
  async take(userId: number, now = new Date()): Promise<AiUsageView> {
    const table = `"${schemaName()}"."ai_usage"`;
    const rows: { count: number }[] = await this.dataSource.query(
      `INSERT INTO ${table} (user_id, date, count) VALUES ($1, $2, 1)
       ON CONFLICT (user_id, date) DO UPDATE SET count = ${table}.count + 1
       WHERE ${table}.count < $3
       RETURNING count`,
      [userId, todayKst(now), AI_DAILY_LIMIT],
    );
    if (rows.length === 0) {
      throw new HttpException(
        `AI 예약은 하루 ${AI_DAILY_LIMIT}번까지 쓸 수 있어요. 오늘은 직접 예약해 주세요.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return { used: rows[0].count, limit: AI_DAILY_LIMIT };
  }
}
