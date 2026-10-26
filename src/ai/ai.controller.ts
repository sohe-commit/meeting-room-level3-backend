import { Body, Controller, Post } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';
import { CurrentUser } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import { AiService } from './ai.service.js';

class AiReserveDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: '원하는 예약 내용을 문장으로 적어 주세요.' })
  @Length(2, 300, { message: '원하는 예약 내용을 2자 이상 300자 이하로 적어 주세요.' })
  text: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('reserve')
  reserve(@CurrentUser() user: AuthUser, @Body() dto: AiReserveDto) {
    return this.ai.reserve(user, dto.text);
  }
}
