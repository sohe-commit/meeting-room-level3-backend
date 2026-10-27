import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import type { AuthUser } from '../common/auth.js';
import { checkReservationTime } from '../common/reservation-rules.js';
import {
  displayStatus,
  isDateString,
  kstDateTime,
  kstDayRange,
  kstParts,
} from '../common/time.js';
import type { DisplayStatus } from '../common/time.js';
import { Reservation } from '../entities/reservation.entity.js';
import type { CreatedVia, MeetingType } from '../entities/reservation.entity.js';
import { Room } from '../entities/room.entity.js';

export interface CreateReservationInput {
  roomId: number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  attendeeCount: number;
  meetingType?: MeetingType;
}

export interface EquipmentNeeds {
  tv?: boolean;
  videoConf?: boolean;
  whiteboard?: boolean;
  projector?: boolean;
}

export interface ReservationFilters {
  date?: string;
  roomId?: number;
  departmentId?: number;
  status?: string;
  q?: string;
}

const STATUSES: DisplayStatus[] = ['UPCOMING', 'ONGOING', 'DONE', 'CANCELLED'];

@Injectable()
export class ReservationsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
  ) {}

  /** 화면에 보낼 모양. 예약자 이름·연락처는 관리자와 본인에게만 보인다. */
  toView(r: Reservation, viewer: AuthUser, now = new Date()) {
    const start = kstParts(r.startAt);
    const isMine = r.userId === viewer.id;
    const canSeeContact = viewer.role === 'ADMIN' || isMine;
    return {
      id: r.id,
      roomId: r.roomId,
      roomName: r.room?.name ?? null,
      roomFloor: r.room?.floor ?? null,
      title: r.title,
      meetingType: r.meetingType,
      attendeeCount: r.attendeeCount,
      date: start.date,
      startTime: start.time,
      endTime: kstParts(r.endAt).time,
      startAt: r.startAt,
      endAt: r.endAt,
      status: displayStatus(r, now),
      createdVia: r.createdVia,
      cancelledAt: r.cancelledAt,
      createdAt: r.createdAt,
      departmentName: r.user?.department?.name ?? null,
      isMine,
      reserver:
        canSeeContact && r.user
          ? { name: r.user.name, email: r.user.email, phone: r.user.phone }
          : null,
    };
  }

  private baseQuery(): SelectQueryBuilder<Reservation> {
    return this.reservations
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.room', 'room')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('user.department', 'department');
  }

  /** 화면 상태(예정/진행 중/완료/취소)를 DB 조건으로 바꾼다. */
  private applyStatus(
    qb: SelectQueryBuilder<Reservation>,
    status: string | undefined,
    now: Date,
  ) {
    if (!status) return;
    if (!STATUSES.includes(status as DisplayStatus)) {
      throw new BadRequestException('상태 값이 올바르지 않아요.');
    }
    if (status === 'CANCELLED') {
      qb.andWhere("r.status = 'CANCELLED'");
      return;
    }
    qb.andWhere("r.status = 'CONFIRMED'");
    if (status === 'UPCOMING') qb.andWhere('r.startAt > :now', { now });
    if (status === 'ONGOING') {
      qb.andWhere('r.startAt <= :now AND r.endAt > :now', { now });
    }
    if (status === 'DONE') qb.andWhere('r.endAt <= :now', { now });
  }

  /** 예약 등록: R1~R7, R15 검사 후 저장 */
  async create(
    user: AuthUser,
    input: CreateReservationInput,
    createdVia: CreatedVia = 'MANUAL',
  ) {
    const now = new Date();
    const meetingType = input.meetingType ?? 'MEETING';
    const timeError = checkReservationTime(input, now, { meetingType, role: user.role }); // R1~R4, R15
    if (timeError) throw new BadRequestException(timeError);

    const startAt = kstDateTime(input.date, input.startTime);
    const endAt = kstDateTime(input.date, input.endTime);

    const id = await this.dataSource.transaction(async (m) => {
      // 같은 회의실에 대한 예약 저장을 한 줄로 세운다. (동시에 눌러도 한 명만 성공: R5)
      const room = await m.findOne(Room, {
        where: { id: input.roomId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!room) throw new NotFoundException('회의실을 찾을 수 없어요.');
      if (!room.isActive) {
        throw new BadRequestException('지금은 점검 중인 회의실이에요.'); // R7
      }
      if (input.attendeeCount > room.capacity) {
        throw new BadRequestException(
          `이 회의실의 정원은 ${room.capacity}명이에요.`, // R6
        );
      }

      // R5: 같은 방에서 시간이 겹치는 예약이 있으면 거절 (끝=시작은 허용)
      const overlaps = await m
        .createQueryBuilder(Reservation, 'r')
        .where('r.roomId = :roomId', { roomId: room.id })
        .andWhere("r.status = 'CONFIRMED'")
        .andWhere('r.startAt < :endAt AND r.endAt > :startAt', {
          startAt,
          endAt,
        })
        .getCount();
      if (overlaps > 0) {
        throw new ConflictException(
          '이 시간에는 이미 예약이 있어요. 다른 시간이나 회의실을 골라 주세요.',
        );
      }

      const saved = await m.save(
        m.create(Reservation, {
          roomId: room.id,
          userId: user.id,
          title: input.title,
          meetingType,
          attendeeCount: input.attendeeCount,
          startAt,
          endAt,
          status: 'CONFIRMED',
          createdVia,
        }),
      );
      return saved.id;
    });

    return this.findOne(user, id);
  }

  /** R8: 본인만, 끝 시각 전까지 취소 (관리자도 남의 예약은 불가) */
  async cancel(user: AuthUser, id: number) {
    const r = await this.reservations.findOne({ where: { id } });
    if (!r) throw new NotFoundException('예약을 찾을 수 없어요.');
    if (r.userId !== user.id) {
      throw new ForbiddenException('본인 예약만 취소할 수 있어요.');
    }
    if (r.status === 'CANCELLED') {
      throw new BadRequestException('이미 취소된 예약이에요.');
    }
    const now = new Date();
    if (r.endAt <= now) {
      throw new BadRequestException('이미 끝난 회의는 취소할 수 없어요.');
    }
    await this.reservations.update(
      { id, status: 'CONFIRMED' },
      { status: 'CANCELLED', cancelledAt: now },
    );
    return this.findOne(user, id);
  }

  async findOne(user: AuthUser, id: number) {
    const r = await this.baseQuery().where('r.id = :id', { id }).getOne();
    if (!r) throw new NotFoundException('예약을 찾을 수 없어요.');
    return this.toView(r, user);
  }

  async listMine(user: AuthUser, status?: string) {
    const now = new Date();
    const qb = this.baseQuery().where('r.userId = :userId', { userId: user.id });
    this.applyStatus(qb, status, now);
    const rows = await qb.orderBy('r.startAt', 'DESC').getMany();
    return rows.map((r) => this.toView(r, user, now));
  }

  /** 관리자용 전체 목록: 날짜·회의실·부서·상태 필터 + 제목 검색 */
  async listAll(user: AuthUser, f: ReservationFilters) {
    const now = new Date();
    const qb = this.baseQuery().where('1 = 1');
    if (f.date) {
      if (!isDateString(f.date)) {
        throw new BadRequestException('날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
      }
      const [from, to] = kstDayRange(f.date);
      qb.andWhere('r.startAt >= :from AND r.startAt < :to', { from, to });
    }
    if (f.roomId) qb.andWhere('r.roomId = :roomId', { roomId: f.roomId });
    if (f.departmentId) {
      qb.andWhere('user.departmentId = :departmentId', {
        departmentId: f.departmentId,
      });
    }
    if (f.q?.trim()) {
      qb.andWhere('r.title ILIKE :q', { q: `%${f.q.trim()}%` });
    }
    this.applyStatus(qb, f.status, now);
    const rows = await qb.orderBy('r.startAt', 'DESC').take(300).getMany();
    return rows.map((r) => this.toView(r, user, now));
  }

  /** 하루치 예약표: 회의실 전체 + 그날 살아 있는 예약 */
  async timeline(user: AuthUser, date: string) {
    if (!isDateString(date)) {
      throw new BadRequestException('날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
    }
    const now = new Date();
    const [from, to] = kstDayRange(date);
    const rooms = await this.rooms.find({ order: { floor: 'ASC', id: 'ASC' } });
    const rows = await this.baseQuery()
      .where("r.status = 'CONFIRMED'")
      .andWhere('r.startAt >= :from AND r.startAt < :to', { from, to })
      .orderBy('r.startAt', 'ASC')
      .getMany();
    return {
      date,
      rooms: rooms.map((room) => ({
        ...room,
        reservations: rows
          .filter((r) => r.roomId === room.id)
          .map((r) => this.toView(r, user, now)),
      })),
    };
  }

  /** 조건(인원·장비)에 맞고 그 시간에 비어 있는 회의실. 정원이 작은 방부터. */
  async findAvailableRooms(
    date: string,
    startTime: string,
    endTime: string,
    attendeeCount: number,
    needs: EquipmentNeeds,
  ): Promise<Room[]> {
    const startAt = kstDateTime(date, startTime);
    const endAt = kstDateTime(date, endTime);
    const qb = this.rooms
      .createQueryBuilder('room')
      .where('room.isActive = true')
      .andWhere('room.capacity >= :attendeeCount', { attendeeCount });
    if (needs.tv) qb.andWhere('room.hasTv = true');
    if (needs.videoConf) qb.andWhere('room.hasVideoConf = true');
    if (needs.whiteboard) qb.andWhere('room.hasWhiteboard = true');
    if (needs.projector) qb.andWhere('room.hasProjector = true');
    qb.andWhere(
      (sub) =>
        'NOT EXISTS ' +
        sub
          .subQuery()
          .select('1')
          .from(Reservation, 'r')
          .where('r.roomId = room.id')
          .andWhere("r.status = 'CONFIRMED'")
          .andWhere('r.startAt < :endAt AND r.endAt > :startAt')
          .getQuery(),
      { startAt, endAt },
    );
    return qb.orderBy('room.capacity', 'ASC').addOrderBy('room.id', 'ASC').getMany();
  }
}
