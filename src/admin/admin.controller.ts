import { Controller, Get, Post } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser, Roles } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import { OPEN_MINUTES, CLOSE_MINUTES, kstDayRange, todayKst } from '../common/time.js';
import { Reservation } from '../entities/reservation.entity.js';
import { RoomIssue } from '../entities/room-issue.entity.js';
import { Room } from '../entities/room.entity.js';
import { ReservationsService } from '../reservations/reservations.service.js';
import { SeedService } from './seed.service.js';

const DAY_MINUTES = CLOSE_MINUTES - OPEN_MINUTES; // 하루 운영 시간 9시간

@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    @InjectRepository(Reservation)
    private readonly reservations: Repository<Reservation>,
    @InjectRepository(RoomIssue) private readonly issues: Repository<RoomIssue>,
    private readonly reservationsService: ReservationsService,
    private readonly seed: SeedService,
  ) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() user: AuthUser) {
    const now = new Date();
    const today = todayKst(now);
    const [from, to] = kstDayRange(today);

    const [rooms, todays, cancelledToday, openIssueCount, recentIssues] =
      await Promise.all([
        this.rooms.find({ order: { floor: 'ASC', id: 'ASC' } }),
        this.reservations
          .createQueryBuilder('r')
          .where("r.status = 'CONFIRMED'")
          .andWhere('r.startAt >= :from AND r.startAt < :to', { from, to })
          .getMany(),
        this.reservations
          .createQueryBuilder('r')
          .leftJoinAndSelect('r.room', 'room')
          .leftJoinAndSelect('r.user', 'user')
          .leftJoinAndSelect('user.department', 'department')
          .where("r.status = 'CANCELLED'")
          .andWhere('r.cancelledAt >= :from AND r.cancelledAt < :to', { from, to })
          .orderBy('r.cancelledAt', 'DESC')
          .getMany(),
        this.issues.count({ where: { status: 'OPEN' } }),
        this.issues.find({
          where: { status: 'OPEN' },
          relations: { room: true },
          order: { createdAt: 'DESC' },
          take: 5,
        }),
      ]);

    const ongoing = todays.filter((r) => r.startAt <= now && now < r.endAt);
    return {
      date: today,
      today: {
        total: todays.length,
        ongoing: ongoing.length,
        upcoming: todays.filter((r) => now < r.startAt).length,
        done: todays.filter((r) => r.endAt <= now).length,
      },
      rooms: rooms.map((room) => {
        const mine = todays.filter((r) => r.roomId === room.id);
        const reservedMinutes = mine.reduce(
          (sum, r) => sum + (r.endAt.getTime() - r.startAt.getTime()) / 60_000,
          0,
        );
        const current = ongoing.find((r) => r.roomId === room.id);
        return {
          id: room.id,
          name: room.name,
          floor: room.floor,
          capacity: room.capacity,
          isActive: room.isActive,
          reservedMinutes,
          reservationRate: Math.round((reservedMinutes / DAY_MINUTES) * 100),
          currentAttendees: current?.attendeeCount ?? 0,
          currentTitle: current?.title ?? null,
        };
      }),
      cancelled: {
        count: cancelledToday.length,
        items: cancelledToday.map((r) =>
          this.reservationsService.toView(r, user, now),
        ),
      },
      issues: {
        openCount: openIssueCount,
        recent: recentIssues.map((i) => ({
          id: i.id,
          roomId: i.roomId,
          roomName: i.room?.name ?? null,
          category: i.category,
          equipment: i.equipment,
          content: i.content,
          createdAt: i.createdAt,
        })),
      },
    };
  }

  @Post('seed')
  async reseed() {
    const counts = await this.seed.reset();
    return { message: '가상 데이터를 처음 상태로 다시 채웠어요.', counts };
  }
}
