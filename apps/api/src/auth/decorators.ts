import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Role } from '@mebel/shared';
import type { AccessPayload } from './token.service.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Token talab qilinmaydi */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Faqat shu rollar. Belgilanmasa — har qanday kirgan foydalanuvchi */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export type AuthUser = { id: string; role: Role };

export type AuthedRequest = Request & { user?: AuthUser };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error('CurrentUser public route\'da ishlatilgan');
  return req.user;
});

export function toAuthUser(p: AccessPayload): AuthUser {
  return { id: p.sub, role: p.role };
}
