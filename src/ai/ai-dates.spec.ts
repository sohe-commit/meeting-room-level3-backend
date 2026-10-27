import { MAX_AI_DAYS, cleanDates, shortDate } from './ai-dates.js';

describe('AI 여러 날 예약 날짜 정리 (R14)', () => {
  it('올바른 날짜만 남기고 중복 없이 순서대로 정리', () => {
    expect(cleanDates(['2026-11-04', '2026-11-02', 'next monday', '2026-11-02', 3])).toEqual([
      '2026-11-02',
      '2026-11-04',
    ]);
  });

  it('배열이 아니면 빈 목록', () => {
    expect(cleanDates(null)).toEqual([]);
    expect(cleanDates('2026-11-02')).toEqual([]);
  });

  it('한 번에 최대 5일', () => {
    expect(MAX_AI_DAYS).toBe(5);
  });

  it('짧은 날짜 표시', () => {
    expect(shortDate('2026-11-02')).toBe('11월 2일(월)');
    expect(shortDate('2026-11-08')).toBe('11월 8일(일)');
  });
});
