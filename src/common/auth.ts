import {
  BadRequestException,
  ParseIntPipe,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '../entities/user.entity.js';

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
  departmentId: number;
}

const IS_PUBLIC = 'isPublic';
const ROLES = 'roles';

/** 로그인 없이 쓸 수 있는 주소 */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** 특정 역할만 쓸 수 있는 주소 (R9, R12) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);

/** 모든 주소에 기본으로 걸리는 검사: 로그인 증표 확인 → 역할 확인 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('로그인이 필요해요.');

    try {
      const payload = await this.jwt.verifyAsync(token);
      req.user = {
        id: payload.sub,
        role: payload.role,
        name: payload.name,
        departmentId: payload.departmentId,
      } satisfies AuthUser;
    } catch {
      throw new UnauthorizedException(
        '로그인이 만료되었어요. 다시 로그인해 주세요.',
      );
    }

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, targets);
    if (roles && !roles.includes(req.user.role)) {
      throw new ForbiddenException('관리자만 사용할 수 있는 기능이에요.');
    }
    return true;
  }
}

/** 주소의 번호(:id)가 숫자가 아니면 쉬운 안내로 거절한다. */
export const IdPipe = new ParseIntPipe({
  exceptionFactory: () => new BadRequestException('번호가 올바르지 않아요.'),
});
