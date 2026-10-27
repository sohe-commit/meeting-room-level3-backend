import { MAX_AI_SLOTS, cleanSlots, shortDate, slotLabel } from './ai-dates.js';

const today = '2026-10-27';

describe('AI 예약 시간 목록 정리 (R14)', () => {
  it('같은 날 여러 시간을 각각 한 건으로 (3시와 7시)', () => {
    const { slots } = cleanSlots(
      [
        { date: '2026-10-28', startTime: '15:00', durationMinutes: 60 },
        { date: '2026-10-28', startTime: '19:00', durationMinutes: 60 },
      ],
      today,
    );
    expect(slots).toEqual([
      { date: '2026-10-28', startTime: '15:00', endTime: '16:00' },
      { date: '2026-10-28', startTime: '19:00', endTime: '20:00' },
    ]);
  });

  it('끝 시각이 있으면 그대로, 없으면 1시간', () => {
    const { slots } = cleanSlots([{ date: '2026-10-28', startTime: '10:00', endTime: '11:30' }, { startTime: '14:00' }], today);
    expect(slots).toEqual([
      { date: '2026-10-27', startTime: '14:00', endTime: '15:00' },
      { date: '2026-10-28', startTime: '10:00', endTime: '11:30' },
    ]);
  });

  it('같은 날짜·시각은 하나로 합치고 순서대로 정렬', () => {
    const { slots } = cleanSlots(
      [
        { date: '2026-10-30', startTime: '10:00' },
        { date: '2026-10-28', startTime: '10:00' },
        { date: '2026-10-28', startTime: '10:00' },
      ],
      today,
    );
    expect(slots.map((s) => s.date)).toEqual(['2026-10-28', '2026-10-30']);
  });

  it('시작 시각이 빠진 항목은 알려 준다', () => {
    expect(cleanSlots([{ date: '2026-10-28' }], today)).toEqual({ slots: [], missingTime: true });
    expect(cleanSlots('15:00', today)).toEqual({ slots: [], missingTime: false });
  });

  it('한 번에 최대 5건', () => {
    expect(MAX_AI_SLOTS).toBe(5);
  });

  it('짧은 날짜·시간 표시', () => {
    expect(shortDate('2026-11-02')).toBe('11월 2일(월)');
    expect(slotLabel({ date: '2026-11-08', startTime: '15:00', endTime: '16:00' })).toBe('11월 8일(일) 15:00');
  });
});
