import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import type { AuthUser } from '../common/auth.js';
import { checkReservationTime } from '../common/reservation-rules.js';
import {
  CLOSE_MINUTES,
  OPEN_MINUTES,
  SLOT_MINUTES,
  isDateString,
  isTimeString,
  kstParts,
  minutesToTime,
  timeToMinutes,
  todayKst,
} from '../common/time.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import type { EquipmentNeeds } from '../reservations/reservations.service.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const UNAVAILABLE = '지금은 AI 예약을 쓸 수 없어요. 직접 예약해 주세요.';

export interface Extracted {
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number | null;
  attendeeCount: number | null;
  needs: EquipmentNeeds;
  title: string | null;
}

function systemPrompt(now: Date) {
  const k = kstParts(now);
  return `너는 회사 회의실 예약 문장에서 조건만 뽑아내는 도우미야.
오늘은 ${k.date} (${WEEKDAYS[k.weekday]}요일), 지금 시각은 ${k.time} (한국 시간)이야.
사용자 문장을 읽고 아래 JSON 하나만 출력해. 설명은 쓰지 마.
{
  "date": "YYYY-MM-DD" 또는 null,
  "startTime": "HH:mm" (24시간제) 또는 null,
  "endTime": "HH:mm" 또는 null,
  "durationMinutes": 숫자 또는 null,
  "attendeeCount": 숫자 또는 null,
  "needs": { "tv": true/false, "videoConf": true/false, "whiteboard": true/false, "projector": true/false },
  "title": "회의 제목" 또는 null
}
규칙:
- "오늘", "내일", "모레", "다음 주 화요일" 같은 말은 오늘 날짜를 기준으로 실제 날짜로 바꿔.
- "오후 2시"는 14:00, "2시 반"은 업무 시간이면 14:30 처럼 바꿔.
- "1시간", "90분", "한 시간 반" 같은 길이는 durationMinutes 로.
- "TV", "모니터", "화면" → tv / "화상회의", "화상", "줌", "원격" → videoConf / "화이트보드", "보드" → whiteboard / "빔", "빔프로젝터", "프로젝터" → projector.
- 문장에 없는 값은 지어내지 말고 null 로 둬. needs 는 말한 장비만 true.
- title 은 회의 목적이 드러나면 짧게 적고, 없으면 null.`;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;

  constructor(private readonly reservations: ReservationsService) {}

  private getClient(): OpenAI {
    const apiKey = process.env.GPT_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException(UNAVAILABLE);
    this.client ??= new OpenAI({ apiKey });
    return this.client;
  }

  /** GPT에게 문장을 보내 조건(JSON)만 받아 온다. */
  private async extract(text: string, now: Date): Promise<Extracted> {
    let content: string | null | undefined;
    try {
      const completion = await this.getClient().chat.completions.create({
        model: process.env.GPT_MODEL || 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt(now) },
          { role: 'user', content: text },
        ],
      });
      content = completion.choices[0]?.message?.content;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.warn(`GPT 호출 실패: ${(error as Error).message}`);
      throw new ServiceUnavailableException(UNAVAILABLE);
    }

    try {
      const raw = JSON.parse(content ?? '{}');
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      const num = (v: unknown) =>
        typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
      const needs = raw.needs ?? {};
      return {
        date: str(raw.date),
        startTime: str(raw.startTime),
        endTime: str(raw.endTime),
        durationMinutes: num(raw.durationMinutes),
        attendeeCount: num(raw.attendeeCount),
        needs: {
          tv: needs.tv === true,
          videoConf: needs.videoConf === true,
          whiteboard: needs.whiteboard === true,
          projector: needs.projector === true,
        },
        title: str(raw.title)?.slice(0, 100) ?? null,
      };
    } catch {
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
  }

  async reserve(user: AuthUser, text: string) {
    const now = new Date();
    const e = await this.extract(text, now);

    // 조건이 부족하면 예약하지 않고 되묻는다.
    if (!e.startTime || !isTimeString(e.startTime)) {
      return { status: 'NEED_MORE', message: '몇 시에 쓰실 건가요? 시작 시각을 함께 적어 주세요.', interpreted: e };
    }
    if (!e.attendeeCount) {
      return { status: 'NEED_MORE', message: '몇 명이 참석하나요? 인원을 함께 적어 주세요.', interpreted: e };
    }
    const date = e.date && isDateString(e.date) ? e.date : todayKst(now);
    const start = timeToMinutes(e.startTime);
    let end =
      e.endTime && isTimeString(e.endTime)
        ? timeToMinutes(e.endTime)
        : start + (e.durationMinutes ?? 60);
    if (end <= start) end = start + 60;

    const conditions = {
      date,
      startTime: e.startTime,
      endTime: minutesToTime(Math.min(end, 24 * 60 - 1)),
      attendeeCount: e.attendeeCount,
      needs: e.needs,
      title: e.title ?? 'AI 예약 회의',
    };

    // R1~R4 를 사람이 직접 예약할 때와 똑같이 검사한다. (R10)
    const timeError = checkReservationTime(conditions, now);
    if (timeError) {
      return { status: 'REJECTED', message: timeError, interpreted: conditions };
    }

    const candidates = await this.reservations.findAvailableRooms(
      date,
      conditions.startTime,
      conditions.endTime,
      conditions.attendeeCount,
      conditions.needs,
    );

    // 정원이 가장 딱 맞는 방부터 예약을 시도한다. 저장 단계에서 R5~R7 을 다시 검사한다.
    for (const room of candidates) {
      try {
        const reservation = await this.reservations.create(
          user,
          {
            roomId: room.id,
            date,
            startTime: conditions.startTime,
            endTime: conditions.endTime,
            title: conditions.title,
            attendeeCount: conditions.attendeeCount,
          },
          'AI',
        );
        return {
          status: 'BOOKED',
          message: `${room.name} 회의실을 예약했어요.`,
          interpreted: conditions,
          reservation,
        };
      } catch (error) {
        if (error instanceof HttpException) continue; // 그 사이 다른 사람이 잡았으면 다음 방
        throw error;
      }
    }

    return {
      status: 'NO_ROOM',
      message: '조건에 맞는 빈 회의실이 없어요.',
      interpreted: conditions,
      suggestions: await this.suggest(conditions, now),
    };
  }

  /** 같은 날 앞뒤 2시간 안에서 같은 길이로 비어 있는 시간을 최대 3개 찾는다. */
  private async suggest(
    c: { date: string; startTime: string; endTime: string; attendeeCount: number; needs: EquipmentNeeds },
    now: Date,
  ) {
    const start = timeToMinutes(c.startTime);
    const length = timeToMinutes(c.endTime) - start;
    const offsets = [30, -30, 60, -60, 90, -90, 120, -120];
    const result: { startTime: string; endTime: string; roomName: string }[] = [];

    for (const offset of offsets) {
      const s = start + offset;
      const e = s + length;
      if (s < OPEN_MINUTES || e > CLOSE_MINUTES || s % SLOT_MINUTES !== 0) continue;
      const slot = { date: c.date, startTime: minutesToTime(s), endTime: minutesToTime(e) };
      if (checkReservationTime(slot, now)) continue;
      const rooms = await this.reservations.findAvailableRooms(
        c.date,
        slot.startTime,
        slot.endTime,
        c.attendeeCount,
        c.needs,
      );
      if (rooms.length > 0) {
        result.push({ startTime: slot.startTime, endTime: slot.endTime, roomName: rooms[0].name });
      }
      if (result.length >= 3) break;
    }
    return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
}
