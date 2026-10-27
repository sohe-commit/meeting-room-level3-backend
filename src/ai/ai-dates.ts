import { isDateString } from '../common/time.js';

/** AI로 한 번에 예약할 수 있는 최대 날짜 수 (R14) */
export const MAX_AI_DAYS = 5;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** GPT가 돌려준 날짜 목록에서 올바른 날짜만 골라 중복 없이 순서대로 정리한다. */
export function cleanDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const dates = raw.filter((v): v is string => typeof v === 'string' && isDateString(v));
  return [...new Set(dates)].sort();
}

/** 2026-11-02 → "11월 2일(월)" */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${m}월 ${d}일(${WEEKDAYS[weekday]})`;
}
