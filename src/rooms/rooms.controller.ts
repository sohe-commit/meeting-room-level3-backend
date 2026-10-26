import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser, IdPipe, Roles } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import {
  ISSUE_CATEGORIES,
  ISSUE_EQUIPMENT,
} from '../entities/room-issue.entity.js';
import type {
  IssueCategory,
  IssueEquipment,
} from '../entities/room-issue.entity.js';
import { RoomsService } from './rooms.service.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RoomDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: '회의실 이름을 입력해 주세요.' })
  @MaxLength(30, { message: '회의실 이름은 30자 이하로 입력해 주세요.' })
  name: string;

  @Type(() => Number)
  @IsInt({ message: '층을 숫자로 입력해 주세요.' })
  @Min(-5, { message: '층을 다시 확인해 주세요.' })
  @Max(100, { message: '층을 다시 확인해 주세요.' })
  floor: number;

  @Type(() => Number)
  @IsInt({ message: '정원을 숫자로 입력해 주세요.' })
  @Min(1, { message: '정원은 1명 이상이어야 해요.' })
  @Max(100, { message: '정원은 100명 이하로 입력해 주세요.' })
  capacity: number;

  @IsBoolean() hasTv: boolean;
  @IsBoolean() hasVideoConf: boolean;
  @IsBoolean() hasWhiteboard: boolean;
  @IsBoolean() hasProjector: boolean;
  @IsBoolean() isActive: boolean;
}

export class UpdateRoomDto extends PartialType(RoomDto) {}

export class IssueDto {
  @IsIn(ISSUE_CATEGORIES, { message: '제보 분류를 골라 주세요.' })
  category: IssueCategory;

  @IsOptional()
  @IsIn(ISSUE_EQUIPMENT, { message: '장비를 다시 골라 주세요.' })
  equipment?: IssueEquipment | null;

  @Transform(trim)
  @IsString({ message: '제보 내용을 2자 이상 200자 이하로 적어 주세요.' })
  @Length(2, 200, { message: '제보 내용을 2자 이상 200자 이하로 적어 주세요.' })
  content: string;
}

const flag = (value?: string) => value === 'true' || value === '1';
const toId = (value?: string) => (value ? Number(value) || undefined : undefined);

@Controller()
export class RoomsController {
  constructor(private readonly service: RoomsService) {}

  @Get('rooms')
  list(
    @Query('minCapacity') minCapacity?: string,
    @Query('tv') tv?: string,
    @Query('videoConf') videoConf?: string,
    @Query('whiteboard') whiteboard?: string,
    @Query('projector') projector?: string,
  ) {
    return this.service.list(toId(minCapacity), {
      tv: flag(tv),
      videoConf: flag(videoConf),
      whiteboard: flag(whiteboard),
      projector: flag(projector),
    });
  }

  @Get('rooms/:id')
  detail(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: number,
    @Query('date') date?: string,
  ) {
    return this.service.detail(user, id, date);
  }

  @Roles('ADMIN')
  @Post('rooms')
  create(@Body() dto: RoomDto) {
    return this.service.create(dto);
  }

  @Roles('ADMIN')
  @Patch('rooms/:id')
  update(@Param('id', IdPipe) id: number, @Body() dto: UpdateRoomDto) {
    return this.service.update(id, dto);
  }

  @Get('rooms/:id/issues')
  roomIssues(
    @Param('id', IdPipe) id: number,
    @Query('status') status?: string,
  ) {
    return this.service.listIssuesForRoom(id, status || undefined);
  }

  @Post('rooms/:id/issues')
  createIssue(
    @CurrentUser() user: AuthUser,
    @Param('id', IdPipe) id: number,
    @Body() dto: IssueDto,
  ) {
    return this.service.createIssue(user, id, dto);
  }

  @Roles('ADMIN')
  @Get('issues')
  listIssues(
    @Query('roomId') roomId?: string,
    @Query('category') category?: string,
    @Query('equipment') equipment?: string,
    @Query('status') status?: string,
  ) {
    return this.service.listIssues({
      roomId: toId(roomId),
      category: category || undefined,
      equipment: equipment || undefined,
      status: status || undefined,
    });
  }

  @Roles('ADMIN')
  @Patch('issues/:id/resolve')
  resolve(@Param('id', IdPipe) id: number) {
    return this.service.resolveIssue(id);
  }
}
