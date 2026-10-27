import {
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import type { AuthUser } from '../common/auth.js';
import { checkReservationTime } from '../common/reservation-rules.js';
import type { DurationContext } from '../common/reservation-rules.js';
import {
  CLOSE_MINUTES,
  OPEN_MINUTES,
  SLOT_MINUTES,
  addDays,
  kstParts,
  minutesToTime,
  timeToMinutes,
  todayKst,
} from '../common/time.js';
import type { Room } from '../entities/index.js';
import type { MeetingType } from '../entities/reservation.entity.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import type { EquipmentNeeds } from '../reservations/reservations.service.js';
import { MAX_AI_SLOTS, cleanSlots, slotLabel } from './ai-dates.js';
import type { TimeSlot } from './ai-dates.js';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const UNAVAILABLE = '지금은 AI 예약을 쓸 수 없어요. 직접 예약해 주세요.';
const NO_ROOM = '조건에 맞는 빈 회의실이 없어요.';

/** 채팅에서 앞서 주고받은 말 한 줄 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface Extracted {
  /** 예약할 시간들. 여러 날·여러 시간이면 한 건씩 */
  slots: TimeSlot[];
  /** 시각을 말하지 않은 항목이 있었는지 */
  missingTime: boolean;
  meetingType: MeetingType;
  attendeeCount: number | null;
  needs: EquipmentNeeds;
  title: string | null;
}

/** GPT가 날짜 계산을 틀리지 않게 이번 주부터 3주치 달력을 적어 준다. (주는 월요일에 시작) */
function calendar(now: Date) {
  const k = kstParts(now);
  const monday = addDays(k.date, -((k.weekday + 6) % 7));
  const weeks = ['이번 주', '다음 주', '다다음 주'];
  return weeks
    .map((label, w) => {
      const days = Array.from({ length: 7 }, (_, d) => {
        const date = addDays(monday, w * 7 + d);
        return `${date}(${WEEKDAYS[(d + 1) % 7]})`;
      });
      return `- ${label}: ${days.join(', ')}`;
    })
    .join('\n');
}

function systemPrompt(now: Date) {
  const k = kstParts(now);
  return `너는 회사 회의실 예약 대화에서 조건만 뽑아내는 도우미야.
오늘은 ${k.date} (${WEEKDAYS[k.weekday]}요일), 지금 시각은 ${k.time} (한국 시간)이야.
오늘 ${k.date}, 내일 ${addDays(k.date, 1)}, 모레 ${addDays(k.date, 2)}.
날짜는 반드시 아래 달력에서 골라. 직접 계산하지 마.
${calendar(now)}
대화를 읽고 아래 JSON 하나만 출력해. 설명은 쓰지 마.
{
  "slots": [
    { "date": "YYYY-MM-DD" 또는 null, "startTime": "HH:mm" 또는 null, "endTime": "HH:mm" 또는 null, "durationMinutes": 숫자 또는 null }
  ],
  "meetingType": "MEETING" 또는 "TRAINING",
  "attendeeCount": 숫자 또는 null,
  "needs": { "tv": true/false, "videoConf": true/false, "whiteboard": true/false, "projector": true/false },
  "title": "회의 제목" 또는 null
}
규칙:
- slots 에는 예약할 회의를 **한 건씩** 모두 넣어. 날짜가 여러 개이거나 시간이 여러 개면 그 조합마다 한 건이야. 하나도 빠뜨리지 마.
  예: "내일 3시와 7시" → 내일 15:00 한 건 + 내일 19:00 한 건 (두 건)
  예: "다음 주 월, 수, 금 2시" → 세 날짜에 각각 14:00 (세 건)
  예: "월요일 10시, 수요일 4시" → 월요일 10:00 + 수요일 16:00 (두 건)
- "오늘", "내일", "모레", "다음 주 화요일" 같은 말은 오늘 날짜를 기준으로 실제 날짜로 바꿔. 날짜를 말하지 않았으면 date 는 null.
- "다음 주 일주일 동안", "이번 주 매일"처럼 기간을 말하면 그 주의 월~금 평일마다 한 건씩 넣어. 주말은 사용자가 주말을 말할 때만 넣어.
- 시각은 24시간제. "오전/오후"를 말하지 않은 1~9시는 오후로 읽어 (3시 → 15:00, 7시 → 19:00). 10·11시는 오전, 12시는 정오야.
- "오후 2시"는 14:00, "2시 반"은 14:30, "10~11시"는 startTime 10:00, endTime 11:00.
- "1시간", "90분", "한 시간 반", "1시간씩" 같은 길이는 각 건의 durationMinutes 로.
- "하루 종일", "종일"은 startTime 10:00, endTime 19:00. "오전 내내"는 10:00~13:00, "오후 내내"는 13:00~19:00.
- 시각을 말하지 않았으면 startTime 은 null. 운영 시간(10~19시) 밖이어도 사용자가 말한 그대로 적어 (서버가 안내해).
- meetingType: 교육, OJT, 온보딩, 워크숍, 세미나, 설명회, 행사처럼 교육·행사 성격이면 "TRAINING", 그 밖의 회의·면접·미팅은 "MEETING".
- "TV", "모니터", "화면" → tv / "화상회의", "화상", "줌", "원격" → videoConf / "화이트보드", "보드" → whiteboard / "빔", "빔프로젝터", "프로젝터" → projector.
- 대화가 여러 줄이면 앞의 말과 도우미의 질문을 이어서 읽고 조건을 합쳐. 예: 도우미가 "몇 명이 참석하나요?"라고 묻고 사용자가 "4명"이라고 하면 attendeeCount 는 4.
- 마지막 말이 앞의 조건을 바꾸면 마지막 말을 따라.
- 대화에 없는 값은 지어내지 말고 null 로 둬. needs 는 말한 장비만 true.
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

  /** GPT에게 대화를 보내 조건(JSON)만 받아 온다. */
  private async extract(text: string, history: ChatTurn[], now: Date): Promise<Extracted> {
    let content: string | null | undefined;
    try {
      const completion = await this.getClient().chat.completions.create({
        model: process.env.GPT_MODEL || 'gpt-4.1-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt(now) },
          ...history.map((turn) => ({ role: turn.role, content: turn.content })),
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
        ...cleanSlots(raw.slots, todayKst(now)),
        meetingType: raw.meetingType === 'TRAINING' ? 'TRAINING' : 'MEETING',
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

  async reserve(user: AuthUser, text: string, history: ChatTurn[] = []) {
    const now = new Date();
    const e = await this.extract(text, history, now);

    const conditions = {
      slots: e.slots,
      meetingType: e.meetingType,
      attendeeCount: e.attendeeCount,
      needs: e.needs,
      title: e.title ?? 'AI 예약 회의',
    };

    // 조건이 부족하면 예약하지 않고 되묻는다.
    if (e.slots.length === 0 || e.missingTime) {
      return { status: 'NEED_MORE', message: '몇 시에 쓰실 건가요? 시작 시각을 알려 주세요.', interpreted: conditions };
    }
    if (!e.attendeeCount) {
      return { status: 'NEED_MORE', message: '몇 명이 참석하나요?', interpreted: conditions };
    }
    const attendeeCount = e.attendeeCount;
    const slots = e.slots;

    // R14: 여러 날·여러 시간은 합쳐서 한 번에 최대 5건까지
    if (slots.length > MAX_AI_SLOTS) {
      return {
        status: 'REJECTED',
        message: `AI로는 한 번에 최대 ${MAX_AI_SLOTS}건까지 예약할 수 있어요. 날짜나 시간을 줄여서 다시 말해 주세요.`,
        interpreted: conditions,
      };
    }

    // R1~R4, R15 를 한 건마다 사람이 직접 예약할 때와 똑같이 검사한다. (R10)
    const rule = { meetingType: conditions.meetingType, role: user.role };
    const failures: (TimeSlot & { message: string })[] = [];
    const okSlots: TimeSlot[] = [];
    for (const slot of slots) {
      const timeError = checkReservationTime(slot, now, rule);
      if (timeError) failures.push({ ...slot, message: timeError });
      else okSlots.push(slot);
    }
    if (okSlots.length === 0) {
      return {
        status: 'REJECTED',
        message: slots.length === 1 ? failures[0].message : `요청한 ${slots.length}건 모두 예약할 수 없어요.`,
        interpreted: conditions,
        reservations: [],
        failures,
      };
    }

    // 한 건마다 빈 방을 찾는다. 여러 건이면 모두에 비어 있는 같은 방을 먼저 고른다.
    const candidates: Room[][] = [];
    for (const slot of okSlots) {
      candidates.push(
        await this.reservations.findAvailableRooms(
          slot.date,
          slot.startTime,
          slot.endTime,
          attendeeCount,
          conditions.needs,
        ),
      );
    }
    const common = candidates[0].filter((room) =>
      candidates.every((list) => list.some((r) => r.id === room.id)),
    );

    const booked = [];
    for (const [i, slot] of okSlots.entries()) {
      const order = [...common, ...candidates[i].filter((r) => !common.some((c) => c.id === r.id))];
      const reservation = await this.bookFirst(user, order, { ...slot, ...conditions, attendeeCount });
      if (reservation) booked.push(reservation);
      else failures.push({ ...slot, message: NO_ROOM });
    }
    failures.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

    // 방이 없어 못 잡은 건이 딱 하나면, 그 날 앞뒤로 비어 있는 다른 시간을 추천한다.
    const noRoom = failures.filter((f) => f.message === NO_ROOM);
    const suggestions =
      noRoom.length === 1
        ? await this.suggest({ ...noRoom[0], attendeeCount, needs: conditions.needs }, now, rule)
        : [];

    // 하나도 못 잡았으면 NO_ROOM
    if (booked.length === 0) {
      return {
        status: 'NO_ROOM',
        message: slots.length === 1 ? NO_ROOM : `요청한 ${slots.length}건을 하나도 예약하지 못했어요. 이유를 확인해 주세요.`,
        interpreted: conditions,
        reservations: [],
        failures,
        suggestions,
      };
    }

    const rooms = [...new Set(booked.map((r) => r.roomName))];
    let message: string;
    if (failures.length > 0) {
      message = `${slots.length}건 중 ${booked.length}건을 예약했어요. 예약하지 못한 건을 확인해 주세요.`;
    } else if (booked.length === 1) {
      message = `${rooms[0]} 회의실을 예약했어요.`;
    } else {
      const list = booked.map((r) => slotLabel(r)).join(', ');
      message =
        rooms.length === 1
          ? `${list} ${booked.length}건 모두 ${rooms[0]} 회의실로 예약했어요.`
          : `${list} ${booked.length}건 모두 예약했어요.`;
    }
    return {
      status: failures.length > 0 ? 'PARTIAL' : 'BOOKED',
      message,
      interpreted: conditions,
      reservations: booked,
      failures,
      suggestions,
    };
  }

  /** 정원이 딱 맞는 방부터 예약을 시도한다. 저장 단계에서 R5~R7 을 다시 검사한다. */
  private async bookFirst(
    user: AuthUser,
    rooms: Room[],
    c: {
      date: string;
      startTime: string;
      endTime: string;
      title: string;
      attendeeCount: number;
      meetingType: MeetingType;
    },
  ) {
    for (const room of rooms) {
      try {
        return await this.reservations.create(
          user,
          {
            roomId: room.id,
            date: c.date,
            startTime: c.startTime,
            endTime: c.endTime,
            title: c.title,
            attendeeCount: c.attendeeCount,
            meetingType: c.meetingType,
          },
          'AI',
        );
      } catch (error) {
        if (error instanceof HttpException) continue; // 그 사이 다른 사람이 잡았으면 다음 방
        throw error;
      }
    }
    return null;
  }

  /** 같은 날 앞뒤 2시간 안에서 같은 길이로 비어 있는 시간을 최대 3개 찾는다. */
  private async suggest(
    c: { date: string; startTime: string; endTime: string; attendeeCount: number; needs: EquipmentNeeds },
    now: Date,
    rule: DurationContext,
  ) {
    const start = timeToMinutes(c.startTime);
    const length = timeToMinutes(c.endTime) - start;
    const offsets = [30, -30, 60, -60, 90, -90, 120, -120];
    const result: { date: string; startTime: string; endTime: string; roomName: string }[] = [];

    for (const offset of offsets) {
      const s = start + offset;
      const e = s + length;
      if (s < OPEN_MINUTES || e > CLOSE_MINUTES || s % SLOT_MINUTES !== 0) continue;
      const slot = { date: c.date, startTime: minutesToTime(s), endTime: minutesToTime(e) };
      if (checkReservationTime(slot, now, rule)) continue;
      const rooms = await this.reservations.findAvailableRooms(
        c.date,
        slot.startTime,
        slot.endTime,
        c.attendeeCount,
        c.needs,
      );
      if (rooms.length > 0) {
        result.push({ ...slot, roomName: rooms[0].name });
      }
      if (result.length >= 3) break;
    }
    return result.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
}
