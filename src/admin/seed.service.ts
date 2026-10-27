import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import {
  addDays,
  kstDateTime,
  kstParts,
  minutesToTime,
  todayKst,
} from '../common/time.js';
import { schemaName } from '../database.js';
import { Department } from '../entities/department.entity.js';
import { Reservation } from '../entities/reservation.entity.js';
import { RoomIssue } from '../entities/room-issue.entity.js';
import { Room } from '../entities/room.entity.js';
import { User } from '../entities/user.entity.js';

/** 가상 계정 비밀번호 (모든 가상 계정 공통, README에 적혀 있음) */
export const SEED_PASSWORD = 'test1234';

const DEPARTMENTS = ['개발팀', '디자인팀', '기획팀', '영업팀', '인사팀', '총무팀'];

// [이름, 이메일, 부서 번호(1부터)] — 모두 가상의 인물
const USERS: [string, string, number][] = [
  ['박총무', 'admin@example.com', 6],
  ['김가상', 'user@example.com', 1],
  ['이하늘', 'user03@example.com', 1],
  ['최바다', 'user04@example.com', 1],
  ['정구름', 'user05@example.com', 2],
  ['강산들', 'user06@example.com', 2],
  ['조나무', 'user07@example.com', 3],
  ['윤별빛', 'user08@example.com', 3],
  ['장햇살', 'user09@example.com', 4],
  ['임바람', 'user10@example.com', 4],
  ['한소나', 'user11@example.com', 4],
  ['오들꽃', 'user12@example.com', 5],
  ['서이슬', 'user13@example.com', 5],
  ['신노을', 'user14@example.com', 6],
  ['권새벽', 'user15@example.com', 1],
  ['황가람', 'user16@example.com', 2],
  ['안보라', 'user17@example.com', 3],
  ['송다온', 'user18@example.com', 4],
  ['류하람', 'user19@example.com', 1],
  ['전누리', 'user20@example.com', 5],
];

const ROOMS = [
  { name: '한라', floor: 3, capacity: 4, hasTv: false, hasVideoConf: false, hasWhiteboard: true, hasProjector: false, isActive: true },
  { name: '백두', floor: 3, capacity: 8, hasTv: true, hasVideoConf: true, hasWhiteboard: true, hasProjector: false, isActive: true },
  { name: '지리', floor: 4, capacity: 6, hasTv: true, hasVideoConf: false, hasWhiteboard: false, hasProjector: true, isActive: true },
  { name: '설악', floor: 4, capacity: 12, hasTv: true, hasVideoConf: true, hasWhiteboard: true, hasProjector: true, isActive: true },
  { name: '태백', floor: 5, capacity: 4, hasTv: false, hasVideoConf: true, hasWhiteboard: false, hasProjector: false, isActive: false },
];

const TITLES = [
  '주간 회의', '디자인 리뷰', '스프린트 계획', '고객사 미팅 준비', '신입 교육',
  '분기 실적 점검', '채용 면접', '아이디어 회의', '코드 리뷰', '1:1 면담',
  '마케팅 전략 회의', '예산 검토', '프로젝트 킥오프', '서비스 장애 회고',
];

// 교육·행사 유형으로 저장할 제목
const TRAINING_TITLES = new Set(['신입 교육']);

/** 설악(4번)을 하루 종일 쓰는 교육·행사. 관리자(총무팀)가 잡는다. (R15) */
function allDayTraining(offset: number, weekday: number): string | null {
  if (offset > 0 && offset <= 7 && weekday === 3) return '신입 OJT (하루 종일)';
  if (offset < 0 && weekday === 4) return '팀장 리더십 워크숍';
  return null;
}

// 하루 예약 패턴: [시작분, 끝분] (10:00=600, 19:00=1140), 서로 겹치지 않고 최대 3시간
const DAY_PATTERNS: [number, number][][] = [
  [[600, 660], [720, 810], [900, 1020]],
  [[630, 720], [840, 900], [960, 1080]],
  [[600, 690], [780, 900], [1050, 1140]],
  [[660, 780], [930, 1050]],
  [[600, 630], [690, 810], [870, 960], [1020, 1110]],
];

// 오늘은 하루 종일 촘촘하게 넣어서 언제 열어도 진행 중·예정·완료가 보이게 한다.
const TODAY_PATTERNS: [number, number][][] = [
  [[600, 690], [720, 810], [840, 930], [960, 1050], [1080, 1140]],
  [[630, 750], [780, 870], [900, 1020], [1050, 1140]],
  [[600, 660], [690, 810], [840, 960], [990, 1110]],
  [[660, 780], [810, 900], [930, 1080], [1110, 1140]],
];

/** 매번 같은 결과를 내는 간단한 난수 */
function makeRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  /** 서버를 처음 켰을 때 비어 있으면 가상 데이터를 채운다. */
  async onApplicationBootstrap() {
    const count = await this.dataSource.getRepository(Department).count();
    if (count === 0) {
      await this.reset();
      this.logger.log('DB가 비어 있어서 가상 데이터를 채웠어요.');
    }
  }

  /** 이 과제 스키마의 테이블만 비우고 가상 데이터를 다시 채운다. */
  async reset() {
    const schema = schemaName();
    const tables = ['room_issues', 'reservations', 'rooms', 'users', 'departments']
      .map((t) => `"${schema}"."${t}"`)
      .join(', ');

    return this.dataSource.transaction(async (m) => {
      await m.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
      await m.insert(Department, DEPARTMENTS.map((name) => ({ name })));

      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
      await m.insert(
        User,
        USERS.map(([name, email, departmentId], i) => ({
          name,
          email,
          departmentId,
          passwordHash,
          phone: `070-7100-${String(i + 1).padStart(4, '0')}`, // 회사 내선 (가상)
          role: i === 0 ? ('ADMIN' as const) : ('EMPLOYEE' as const),
        })),
      );
      await m.insert(Room, ROOMS);

      const reservations = await this.insertReservations(m);
      const issues = await this.insertIssues(m);
      return {
        departments: DEPARTMENTS.length,
        users: USERS.length,
        rooms: ROOMS.length,
        reservations,
        issues,
      };
    });
  }

  private async insertReservations(m: EntityManager) {
    const random = makeRandom(20261026);
    const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
    const now = new Date();
    const today = todayKst(now);
    const todayStart = kstDateTime(today, '00:00');
    const rows: Partial<Reservation>[] = [];
    let index = 0;
    const busy = (userId: number, startAt: Date, endAt: Date) =>
      rows.some(
        (r) => r.userId === userId && r.status !== 'CANCELLED' && r.startAt! < endAt && r.endAt! > startAt,
      );

    for (let offset = -7; offset <= 14; offset++) {
      const date = addDays(today, offset);
      const weekday = kstParts(kstDateTime(date, '12:00')).weekday;
      const isToday = offset === 0;
      if (!isToday && (weekday === 0 || weekday === 6)) continue; // 주말은 비움

      // 사용 중인 회의실 4개(1~4번)만. 하루 종일 교육이 있는 설악(4번)부터 채워서 다른 회의와 사람이 겹치지 않게 한다.
      for (const roomId of [4, 3, 2, 1]) {
        const room = ROOMS[roomId - 1];
        const training = roomId === 4 && !isToday ? allDayTraining(offset, weekday) : null;
        if (training) {
          index++;
          rows.push({
            roomId,
            userId: 1,
            title: training,
            meetingType: 'TRAINING',
            attendeeCount: 10,
            startAt: kstDateTime(date, '10:00'),
            endAt: kstDateTime(date, '18:00'),
            status: 'CONFIRMED',
            cancelledAt: null,
            createdVia: 'MANUAL',
            createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60_000),
          });
          continue;
        }
        const blocks = isToday
          ? TODAY_PATTERNS[roomId - 1]
          : pick(DAY_PATTERNS).filter(() => offset < 0 || random() < 0.7);

        for (const [start, end] of blocks) {
          index++;
          const startAt = kstDateTime(date, minutesToTime(start));
          const endAt = kstDateTime(date, minutesToTime(end));
          // 김가상(user@example.com, 2번)에게 5건 중 1건을 준다. 같은 사람의 회의가 겹치지 않게 한다.
          let userId = index % 5 === 0 ? 2 : 1 + Math.floor(random() * USERS.length);
          for (let tries = 0; busy(userId, startAt, endAt) && tries < USERS.length; tries++) {
            userId = (userId % USERS.length) + 1;
          }

          let cancelled = index % 7 === 0;
          if (isToday && (roomId === 2 || roomId === 4) && start === TODAY_PATTERNS[roomId - 1][1][0]) {
            cancelled = true; // 오늘 취소 현황이 비지 않게
          }
          let cancelledAt: Date | null = null;
          if (cancelled) {
            cancelledAt = isToday
              ? new Date(Math.max(todayStart.getTime() + 60_000, now.getTime() - 20 * 60_000))
              : new Date(Math.min(startAt.getTime(), now.getTime()) - 26 * 60 * 60_000);
          }

          const title = pick(TITLES);
          rows.push({
            roomId,
            userId,
            title,
            meetingType: TRAINING_TITLES.has(title) ? 'TRAINING' : 'MEETING',
            attendeeCount: 2 + Math.floor(random() * (room.capacity - 1)),
            startAt,
            endAt,
            status: cancelled ? 'CANCELLED' : 'CONFIRMED',
            cancelledAt,
            createdVia: index % 9 === 0 ? 'AI' : 'MANUAL',
            createdAt: new Date(Math.min(startAt.getTime(), now.getTime()) - 3 * 24 * 60 * 60_000),
          });
        }
      }
    }

    await m.insert(Reservation, rows);
    return rows.length;
  }

  private async insertIssues(m: EntityManager) {
    const daysAgo = (days: number, hours = 0) =>
      new Date(Date.now() - (days * 24 + hours) * 60 * 60_000);
    const rows: Partial<RoomIssue>[] = [
      { roomId: 1, userId: 2, category: 'SUPPLY', equipment: null, content: '빨간 매직이 안 나와요.', status: 'OPEN', createdAt: daysAgo(0, 2) },
      { roomId: 2, userId: 5, category: 'BROKEN', equipment: 'VIDEO_CONF', content: '화상회의 카메라가 자꾸 꺼져요.', status: 'OPEN', createdAt: daysAgo(1) },
      { roomId: 3, userId: 9, category: 'BROKEN', equipment: 'PROJECTOR', content: '빔프로젝터 화면이 노랗게 나와요.', status: 'OPEN', createdAt: daysAgo(2) },
      { roomId: 3, userId: 7, category: 'OTHER', equipment: null, content: '의자 하나가 삐걱거려요.', status: 'OPEN', createdAt: daysAgo(3) },
      { roomId: 4, userId: 12, category: 'BROKEN', equipment: 'OTHER', content: '에어컨 바람이 약해요.', status: 'OPEN', createdAt: daysAgo(0, 5) },
      { roomId: 5, userId: 14, category: 'BROKEN', equipment: 'VIDEO_CONF', content: '화상회의 장비 전원이 안 들어와요. 수리 요청했어요.', status: 'OPEN', createdAt: daysAgo(4) },
      { roomId: 4, userId: 3, category: 'CLEANING', equipment: null, content: '회의 끝나고 컵이 많이 남아 있어요.', status: 'RESOLVED', createdAt: daysAgo(5), resolvedAt: daysAgo(4) },
      { roomId: 2, userId: 10, category: 'SUPPLY', equipment: null, content: '화이트보드 지우개가 없어요.', status: 'RESOLVED', createdAt: daysAgo(6), resolvedAt: daysAgo(5) },
    ];
    await m.insert(RoomIssue, rows);
    return rows.length;
  }
}
