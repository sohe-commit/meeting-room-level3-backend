import { Body, Controller, Post } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CurrentUser } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiService } from './ai.service.js';
import type { ChatTurn } from './ai.service.js';

class ChatTurnDto implements ChatTurn {
  @IsIn(['user', 'assistant'], { message: '대화 내용이 올바르지 않아요.' })
  role: 'user' | 'assistant';

  @IsString({ message: '대화 내용이 올바르지 않아요.' })
  @MaxLength(500, { message: '대화 내용이 너무 길어요.' })
  content: string;
}

class AiReserveDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: '원하는 예약 내용을 문장으로 적어 주세요.' })
  @Length(2, 300, { message: '원하는 예약 내용을 2자 이상 300자 이하로 적어 주세요.' })
  text: string;

  /** 앞서 주고받은 대화 (채팅으로 이어서 말할 때) */
  @IsOptional()
  @IsArray({ message: '대화 내용이 올바르지 않아요.' })
  @ArrayMaxSize(12, { message: '대화가 너무 길어요. 새 대화로 다시 시작해 주세요.' })
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[];
}

@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly usage: AiUsageService,
  ) {}

  @Post('reserve')
  async reserve(@CurrentUser() user: AuthUser, @Body() dto: AiReserveDto) {
    // GPT 요금이 끝없이 나가지 않게, GPT를 부르기 전에 오늘 횟수부터 확인한다. (R16)
    const usage = await this.usage.take(user.id);
    const result = await this.ai.reserve(user, dto.text, dto.history ?? []);
    return { ...result, usage };
  }
}
