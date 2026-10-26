import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthUser } from '../common/auth.js';
import { isDateString, todayKst } from '../common/time.js';
import { RoomIssue } from '../entities/room-issue.entity.js';
import type {
  IssueCategory,
  IssueEquipment,
} from '../entities/room-issue.entity.js';
import { Room } from '../entities/room.entity.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import type { EquipmentNeeds } from '../reservations/reservations.service.js';

export interface RoomInput {
  name: string;
  floor: number;
  capacity: number;
  hasTv: boolean;
  hasVideoConf: boolean;
  hasWhiteboard: boolean;
  hasProjector: boolean;
  isActive: boolean;
}

export interface IssueInput {
  category: IssueCategory;
  equipment?: IssueEquipment | null;
  content: string;
}

export interface IssueFilters {
  roomId?: number;
  category?: string;
  equipment?: string;
  status?: string;
}

const EQUIPMENT_LABEL: Record<IssueEquipment, string> = {
  TV: 'TV',
  VIDEO_CONF: '화상회의 장비',
  WHITEBOARD: '화이트보드',
  PROJECTOR: '빔프로젝터',
  OTHER: '기타 장비',
};

/** 마지막 글자에 받침이 있으면 '이', 없으면 '가' (영문은 '가') */
function subjectJosa(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '가';
  return code % 28 === 0 ? '가' : '이';
}

@Injectable()
export class RoomsService {
  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(RoomIssue) private readonly issues: Repository<RoomIssue>,
    private readonly reservations: ReservationsService,
  ) {}

  /** 회의실별 처리 안 된 제보 수 */
  private async openIssueCounts(): Promise<Map<number, number>> {
    const rows: { roomId: number; count: string }[] = await this.issues
      .createQueryBuilder('i')
      .select('i.roomId', 'roomId')
      .addSelect('COUNT(*)', 'count')
      .where("i.status = 'OPEN'")
      .groupBy('i.roomId')
      .getRawMany();
    return new Map(rows.map((r) => [Number(r.roomId), Number(r.count)]));
  }

  async list(minCapacity?: number, needs: EquipmentNeeds = {}) {
    const qb = this.rooms.createQueryBuilder('room');
    if (minCapacity) {
      qb.andWhere('room.capacity >= :minCapacity', { minCapacity });
    }
    if (needs.tv) qb.andWhere('room.hasTv = true');
    if (needs.videoConf) qb.andWhere('room.hasVideoConf = true');
    if (needs.whiteboard) qb.andWhere('room.hasWhiteboard = true');
    if (needs.projector) qb.andWhere('room.hasProjector = true');
    const [rooms, counts] = await Promise.all([
      qb.orderBy('room.floor', 'ASC').addOrderBy('room.id', 'ASC').getMany(),
      this.openIssueCounts(),
    ]);
    return rooms.map((room) => ({
      ...room,
      openIssueCount: counts.get(room.id) ?? 0,
    }));
  }

  private async getRoom(id: number): Promise<Room> {
    const room = await this.rooms.findOne({ where: { id } });
    if (!room) throw new NotFoundException('회의실을 찾을 수 없어요.');
    return room;
  }

  /** 회의실 상세: 정보 + 고른 날짜 시간표 + 처리 안 된 제보 */
  async detail(user: AuthUser, id: number, date?: string) {
    const day = date || todayKst();
    if (!isDateString(day)) {
      throw new BadRequestException('날짜를 YYYY-MM-DD 형식으로 입력해 주세요.');
    }
    const room = await this.getRoom(id);
    const timeline = await this.reservations.timeline(user, day);
    const openIssues = await this.listIssuesForRoom(id, 'OPEN');
    return {
      ...room,
      date: day,
      reservations:
        timeline.rooms.find((r) => r.id === id)?.reservations ?? [],
      openIssues,
    };
  }

  async create(input: RoomInput) {
    await this.ensureUniqueName(input.name);
    return this.rooms.save(this.rooms.create(input));
  }

  async update(id: number, input: Partial<RoomInput>) {
    const room = await this.getRoom(id);
    if (input.name && input.name !== room.name) {
      await this.ensureUniqueName(input.name);
    }
    Object.assign(room, input);
    return this.rooms.save(room);
  }

  private async ensureUniqueName(name: string) {
    if (await this.rooms.exists({ where: { name } })) {
      throw new ConflictException('같은 이름의 회의실이 이미 있어요.');
    }
  }

  // ---------- 시설 제보 ----------

  private issueView(i: RoomIssue) {
    return {
      id: i.id,
      roomId: i.roomId,
      roomName: i.room?.name ?? null,
      category: i.category,
      equipment: i.equipment,
      content: i.content,
      status: i.status,
      createdAt: i.createdAt,
      resolvedAt: i.resolvedAt,
      writerName: i.user?.name ?? null,
      writerDepartment: i.user?.department?.name ?? null,
    };
  }

  private issueQuery() {
    return this.issues
      .createQueryBuilder('i')
      .leftJoinAndSelect('i.room', 'room')
      .leftJoinAndSelect('i.user', 'user')
      .leftJoinAndSelect('user.department', 'department');
  }

  async listIssuesForRoom(roomId: number, status?: string) {
    const qb = this.issueQuery().where('i.roomId = :roomId', { roomId });
    if (status) qb.andWhere('i.status = :status', { status });
    const rows = await qb.orderBy('i.createdAt', 'DESC').getMany();
    return rows.map((i) => this.issueView(i));
  }

  async listIssues(f: IssueFilters) {
    const qb = this.issueQuery().where('1 = 1');
    if (f.roomId) qb.andWhere('i.roomId = :roomId', { roomId: f.roomId });
    if (f.category) qb.andWhere('i.category = :category', { category: f.category });
    if (f.equipment) {
      qb.andWhere('i.equipment = :equipment', { equipment: f.equipment });
    }
    if (f.status) qb.andWhere('i.status = :status', { status: f.status });
    const rows = await qb
      .orderBy('i.status', 'ASC') // OPEN 이 RESOLVED 보다 먼저
      .addOrderBy('i.createdAt', 'DESC')
      .getMany();
    return rows.map((i) => this.issueView(i));
  }

  /** R11(입력 검사는 DTO), R13: 장비 고장이면 그 방에 있는 장비만 */
  async createIssue(user: AuthUser, roomId: number, input: IssueInput) {
    const room = await this.getRoom(roomId);
    let equipment: IssueEquipment | null = null;

    if (input.category === 'BROKEN') {
      if (!input.equipment) {
        throw new BadRequestException('어떤 장비가 고장 났는지 골라 주세요.');
      }
      const has: Record<IssueEquipment, boolean> = {
        TV: room.hasTv,
        VIDEO_CONF: room.hasVideoConf,
        WHITEBOARD: room.hasWhiteboard,
        PROJECTOR: room.hasProjector,
        OTHER: true,
      };
      if (!has[input.equipment]) {
        const label = EQUIPMENT_LABEL[input.equipment];
        throw new BadRequestException(`이 회의실에는 ${label}${subjectJosa(label)} 없어요.`);
      }
      equipment = input.equipment;
    }

    const saved = await this.issues.save(
      this.issues.create({
        roomId,
        userId: user.id,
        category: input.category,
        equipment,
        content: input.content,
        status: 'OPEN',
      }),
    );
    const row = await this.issueQuery().where('i.id = :id', { id: saved.id }).getOne();
    return this.issueView(row!);
  }

  /** R12: 관리자만(컨트롤러에서 검사), 이미 처리 완료면 다시 못 바꿈 */
  async resolveIssue(id: number) {
    const issue = await this.issues.findOne({ where: { id } });
    if (!issue) throw new NotFoundException('제보를 찾을 수 없어요.');
    if (issue.status === 'RESOLVED') {
      throw new BadRequestException('이미 처리 완료된 제보예요.');
    }
    await this.issues.update(
      { id, status: 'OPEN' },
      { status: 'RESOLVED', resolvedAt: new Date() },
    );
    const row = await this.issueQuery().where('i.id = :id', { id }).getOne();
    return this.issueView(row!);
  }
}
