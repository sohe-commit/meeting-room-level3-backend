import {
  CLOSE_MINUTES,
  MAX_DAYS_AHEAD,
  MAX_DURATION_MINUTES,
  OPEN_MINUTES,
  SLOT_MINUTES,
  addDays,
  isDateString,
  isTimeString,
  kstDateTime,
  timeToMinutes,
  todayKst,
} from './time.js';

export interface TimeRequest {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * 예약 시간 규칙 R1~R4 검사.
 * 어긋나면 사용자에게 보여 줄 안내 문구를, 통과하면 null을 돌려준다.
 */
export function checkReservationTime(
  req: TimeRequest,
  now = new Date(),
): string | null {
  if (!isDateString(req.date)) return '날짜를 YYYY-MM-DD 형식으로 입력해 주세요.';
  if (!isTimeString(req.startTime) || !isTimeString(req.endTime)) {
    return '시각을 HH:mm 형식으로 입력해 주세요.';
  }

  const start = timeToMinutes(req.startTime);
  const end = timeToMinutes(req.endTime);

  // R2: 30분 단위
  if (start % SLOT_MINUTES !== 0 || end % SLOT_MINUTES !== 0) {
    return '예약은 30분 단위로 잡을 수 있어요.';
  }
  // R1: 운영 시간 10:00~19:00
  if (start < OPEN_MINUTES || end > CLOSE_MINUTES) {
    return '회의실은 오전 10시부터 오후 7시까지 이용할 수 있어요.';
  }
  if (end <= start) return '끝 시각은 시작 시각보다 늦어야 해요.';
  // R3: 최대 3시간 (최소 30분은 30분 단위 + 끝>시작 으로 보장)
  if (end - start > MAX_DURATION_MINUTES) {
    return '한 번에 최대 3시간까지 예약할 수 있어요.';
  }
  // R4: 지난 시간 불가, 오늘부터 30일 뒤까지
  if (kstDateTime(req.date, req.startTime) <= now) {
    return '이미 지난 시간은 예약할 수 없어요.';
  }
  if (req.date > addDays(todayKst(now), MAX_DAYS_AHEAD)) {
    return '오늘부터 30일 뒤까지만 예약할 수 있어요.';
  }
  return null;
}
