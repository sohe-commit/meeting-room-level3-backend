import { Column, Entity, PrimaryColumn } from 'typeorm';

/** 직원별·날짜별(한국 날짜) AI 예약 사용 횟수. GPT 요금이 끝없이 나가지 않게 막는 데 쓴다. */
@Entity('ai_usage')
export class AiUsage {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @PrimaryColumn({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  count: number;
}
