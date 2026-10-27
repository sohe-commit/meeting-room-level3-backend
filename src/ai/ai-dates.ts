import { isDateString, isTimeString, minutesToTime, timeToMinutes } from '../common/time.js';

/** AI로 한 번에 예약할 수 있는 최대 건수 (여러 날·여러 시간 합쳐서, R14) */
export const MAX_AI_SLOTS = 5;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 예약 한 건의 날짜와 시간 */
export interface TimeSlot {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * GPT가 돌려준 시간 목록을 정리한다.
 * - 날짜가 없거나 틀리면 fallbackDate(오늘)로
 * - 끝 시각이 없으면 길이(없으면 1시간)로 계산
 * - 같은 날짜·시작 시각은 하나로 합치고 날짜·시각 순으로 정렬
 * 시작 시각이 빠진 항목이 있으면 missingTime 을 true 로 알려 준다.
 */
export function cleanSlots(
  raw: unknown,
  fallbackDate: string,
): { slots: TimeSlot[]; missingTime: boolean } {
  if (!Array.isArray(raw)) return { slots: [], missingTime: false };
  let missingTime = false;
  const slots = new Map<string, TimeSlot>();

  for (const item of raw) {
    const v = (item ?? {}) as Record<string, unknown>;
    const startTime = typeof v.startTime === 'string' && isTimeString(v.startTime) ? v.startTime : null;
    if (!startTime) {
      missingTime = true;
      continue;
    }
    const date = typeof v.date === 'string' && isDateString(v.date) ? v.date : fallbackDate;
    const start = timeToMinutes(startTime);
    const duration =
      typeof v.durationMinutes === 'number' && v.durationMinutes > 0 ? Math.round(v.durationMinutes) : 60;
    let end =
      typeof v.endTime === 'string' && isTimeString(v.endTime) ? timeToMinutes(v.endTime) : start + duration;
    if (end <= start) end = start + duration;
    slots.set(`${date} ${startTime}`, { date, startTime, endTime: minutesToTime(Math.min(end, 24 * 60 - 1)) });
  }

  const sorted = [...slots.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
  );
  return { slots: sorted, missingTime };
}

/** 2026-11-02 → "11월 2일(월)" */
export function shortDate(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return `${m}월 ${d}일(${WEEKDAYS[weekday]})`;
}

/** "11월 2일(월) 15:00" */
export function slotLabel(s: TimeSlot): string {
  return `${shortDate(s.date)} ${s.startTime}`;
}
