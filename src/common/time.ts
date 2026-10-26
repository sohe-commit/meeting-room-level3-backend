// 모든 날짜·시간 계산은 한국 시간(KST, UTC+9) 기준이다.
// Render 서버는 UTC로 돌아가므로 서버 시간대에 기대지 않고 직접 9시간을 더해 계산한다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export const OPEN_MINUTES = 10 * 60; // 10:00
export const CLOSE_MINUTES = 19 * 60; // 19:00
export const SLOT_MINUTES = 30;
export const MAX_DURATION_MINUTES = 180;
export const MAX_DAYS_AHEAD = 30;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function isDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value);
}

export function isTimeString(value: string): boolean {
  return TIME_RE.test(value);
}

/** "HH:mm" → 자정부터 몇 분인지 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** Date → 한국 시간 기준 날짜/시각 */
export function kstParts(date: Date) {
  const k = new Date(date.getTime() + KST_OFFSET_MS);
  const dateStr = `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
  const minutes = k.getUTCHours() * 60 + k.getUTCMinutes();
  return {
    date: dateStr,
    time: minutesToTime(minutes),
    minutes,
    weekday: k.getUTCDay(),
  };
}

export function todayKst(now = new Date()): string {
  return kstParts(now).date;
}

/** 한국 시간 "YYYY-MM-DD" + "HH:mm" → Date */
export function kstDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+09:00`);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 한국 시간으로 그 날의 [00:00, 다음 날 00:00) */
export function kstDayRange(date: string): [Date, Date] {
  return [kstDateTime(date, '00:00'), kstDateTime(addDays(date, 1), '00:00')];
}

export type DisplayStatus = 'UPCOMING' | 'ONGOING' | 'DONE' | 'CANCELLED';

/** 화면에 보이는 예약 상태: DB에는 예약됨/취소됨만 있고 나머지는 지금 시각으로 계산한다. */
export function displayStatus(
  r: { status: string; startAt: Date; endAt: Date },
  now = new Date(),
): DisplayStatus {
  if (r.status === 'CANCELLED') return 'CANCELLED';
  if (now < r.startAt) return 'UPCOMING';
  if (now < r.endAt) return 'ONGOING';
  return 'DONE';
}
