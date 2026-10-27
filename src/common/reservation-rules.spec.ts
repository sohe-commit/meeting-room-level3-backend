import { checkReservationTime } from './reservation-rules.js';
import { displayStatus, kstDateTime, kstParts } from './time.js';

// 기준 시각: 2026-10-26(월) 09:00 한국 시간
const now = kstDateTime('2026-10-26', '09:00');
const ok = { date: '2026-10-27', startTime: '14:00', endTime: '15:00' };

describe('예약 시간 규칙 (R1~R4)', () => {
  it('규칙에 맞으면 통과', () => {
    expect(checkReservationTime(ok, now)).toBeNull();
  });

  it('R1: 10:00 전이나 19:00 뒤는 거절', () => {
    expect(checkReservationTime({ ...ok, startTime: '09:30' }, now)).toContain('오전 10시');
    expect(checkReservationTime({ ...ok, startTime: '18:00', endTime: '19:30' }, now)).toContain('오후 7시');
  });

  it('R2: 30분 단위가 아니면 거절', () => {
    expect(checkReservationTime({ ...ok, startTime: '14:10' }, now)).toContain('30분 단위');
  });

  it('R3: 3시간 초과는 거절, 딱 3시간은 허용', () => {
    expect(checkReservationTime({ ...ok, startTime: '10:00', endTime: '13:30' }, now)).toContain('최대 3시간');
    expect(checkReservationTime({ ...ok, startTime: '10:00', endTime: '13:00' }, now)).toBeNull();
  });

  it('끝 시각이 시작보다 빠르면 거절', () => {
    expect(checkReservationTime({ ...ok, startTime: '15:00', endTime: '14:00' }, now)).toContain('늦어야');
  });

  it('R4: 지난 시간과 30일 넘는 날짜는 거절, 30일째는 허용', () => {
    expect(checkReservationTime({ ...ok, date: '2026-10-25' }, now)).toContain('지난 시간');
    expect(checkReservationTime({ ...ok, date: '2026-11-25' }, now)).toBeNull();
    expect(checkReservationTime({ ...ok, date: '2026-11-26' }, now)).toContain('30일');
  });
});

describe('한국 시간 계산', () => {
  it('UTC 자정 직전도 한국 날짜로 계산', () => {
    const d = new Date('2026-10-26T15:30:00Z'); // 한국 10-27 00:30
    expect(kstParts(d)).toMatchObject({ date: '2026-10-27', time: '00:30' });
  });

  it('화면 상태는 지금 시각으로 정해진다', () => {
    const r = {
      status: 'CONFIRMED',
      startAt: kstDateTime('2026-10-26', '10:00'),
      endAt: kstDateTime('2026-10-26', '11:00'),
    };
    expect(displayStatus(r, kstDateTime('2026-10-26', '09:59'))).toBe('UPCOMING');
    expect(displayStatus(r, kstDateTime('2026-10-26', '10:00'))).toBe('ONGOING');
    expect(displayStatus(r, kstDateTime('2026-10-26', '11:00'))).toBe('DONE');
    expect(displayStatus({ ...r, status: 'CANCELLED' }, now)).toBe('CANCELLED');
  });
});

describe('유형·역할별 길이 제한 (R15)', () => {
  const allDay = { ...ok, startTime: '10:00', endTime: '19:00' };

  it('직원은 교육·행사여도 3시간을 넘길 수 없음', () => {
    expect(checkReservationTime(allDay, now, { role: 'EMPLOYEE', meetingType: 'TRAINING' })).toContain('총무팀에 요청');
  });

  it('관리자도 일반 회의는 3시간까지', () => {
    expect(checkReservationTime(allDay, now, { role: 'ADMIN', meetingType: 'MEETING' })).toContain('교육·행사');
  });

  it('관리자가 교육·행사로 잡으면 하루 종일(10~19시) 허용', () => {
    expect(checkReservationTime(allDay, now, { role: 'ADMIN', meetingType: 'TRAINING' })).toBeNull();
  });

  it('교육·행사여도 운영 시간 밖은 거절', () => {
    expect(
      checkReservationTime({ ...ok, startTime: '09:00', endTime: '18:00' }, now, { role: 'ADMIN', meetingType: 'TRAINING' }),
    ).toContain('오전 10시');
  });
});
