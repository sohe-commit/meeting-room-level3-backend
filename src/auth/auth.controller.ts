import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import bcrypt from 'bcryptjs';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { Repository } from 'typeorm';
import { CurrentUser, Public } from '../common/auth.js';
import type { AuthUser } from '../common/auth.js';
import { Department } from '../entities/department.entity.js';
import { User } from '../entities/user.entity.js';

class LoginDto {
  @IsEmail({}, { message: '이메일 형식으로 입력해 주세요.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: '비밀번호를 입력해 주세요.' })
  password: string;
}

export function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    departmentId: user.departmentId,
    departmentName: user.department?.name ?? null,
  };
}

@Controller()
export class AuthController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('auth/login')
  async login(@Body() dto: LoginDto) {
    const user = await this.users.findOne({
      where: { email: dto.email.trim().toLowerCase() },
      relations: { department: true },
    });
    const ok = user && (await bcrypt.compare(dto.password, user.passwordHash));
    if (!user || !ok) {
      throw new UnauthorizedException(
        '이메일 또는 비밀번호를 다시 확인해 주세요.',
      );
    }
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      name: user.name,
      departmentId: user.departmentId,
    });
    return { accessToken, user: publicUser(user) };
  }

  @Get('auth/me')
  async me(@CurrentUser() current: AuthUser) {
    const user = await this.users.findOne({
      where: { id: current.id },
      relations: { department: true },
    });
    if (!user) throw new NotFoundException('계정을 찾을 수 없어요.');
    return publicUser(user);
  }

  @Get('departments')
  listDepartments() {
    return this.departments.find({ order: { id: 'ASC' } });
  }
}
