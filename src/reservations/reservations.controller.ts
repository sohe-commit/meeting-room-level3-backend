import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser, IdPipe, Roles } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import { todayKst } from '../common/time.js';
import type { MeetingType } from '../entities/reservation.entity.js';
import { ReservationsService } from './reservations.service.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateReservationDto {
  @Type(() => Number)
  @IsInt({ message: '회의실을 골라 주세요.' })
  roomId: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '날짜를 골라 주세요.' })
  date: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: '시작 시각을 골라 주세요.' })
  startTime: string;

  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: '끝 시각을 골라 주세요.' })
  endTime: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: '회의 제목을 입력해 주세요.' })
  @MaxLength(100, { message: '회의 제목은 100자 이하로 입력해 주세요.' })
  title: string;

  @Type(() => Number)
  @IsInt({ message: '참석 인원을 숫자로 입력해 주세요.' })
  @Min(1, { message: '참석 인원은 1명 이상이어야 해요.' })
  attendeeCount: number;

  /** 회의 유형 (없으면 일반 회의) */
  @IsOptional()
  @IsIn(['MEETING', 'TRAINING'], { message: '회의 유형을 골라 주세요.' })
  meetingType?: MeetingType;
}

const toId = (value?: string) => (value ? Number(value) || undefined : undefined);

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  @Get('timeline')
  timeline(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.service.timeline(user, date || todayKst());
  }

  @Get('me')
  listMine(@CurrentUser() user: AuthUser, @Query('status') status?: string) {
    return this.service.listMine(user, status || undefined);
  }

  @Roles('ADMIN')
  @Get()
  listAll(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
    @Query('roomId') roomId?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listAll(user, {
      date: date || undefined,
      roomId: toId(roomId),
      departmentId: toId(departmentId),
      status: status || undefined,
      q,
    });
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: number,
  ) {
    return this.service.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReservationDto) {
    return this.service.create(user, dto);
  }

  @Patch(':id/cancel')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: number,
  ) {
    return this.service.cancel(user, id);
  }
}
