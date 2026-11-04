import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import { type AuthedRequest, IS_PUBLIC, ROLES, toAuthUser } from './decorators.js';
import type { AccessPayload } from './token.service.js';

/**
 * Global guard: token tekshiradi, keyin @Roles bo'lsa rolni.
 * Public route'da token bo'lsa ham o'qiladi (katalogda shaxsiy narx uchun).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // WebSocket autentifikatsiyasi ulanish paytida RealtimeGateway'da
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) ?? false;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    const token = extractBearer(req.headers.authorization);
    if (token) {
      try {
        req.user = toAuthUser(await this.jwt.verifyAsync<AccessPayload>(token));
      } catch {
        if (!isPublic) throw AppException.unauthorized();
      }
    }
    if (isPublic) return true;
    if (!req.user) throw AppException.unauthorized();

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles && !roles.includes(req.user.role)) throw AppException.forbidden();
    return true;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [type, token] = header.split(' ');
  return type === 'Bearer' && token ? token : null;
}
