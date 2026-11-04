import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppException } from '../common/app-exception.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { OtpService } from './otp.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { TokenService } from './token.service.js';

/** Bitta raqamga 15 daqiqada shuncha noto'g'ri parol */
const LOGIN_FAIL_LIMIT = 10;
const LOGIN_FAIL_WINDOW = 900;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async verifyOtp(phone: string, code: string, userAgent?: string) {
    await this.otp.verify(phone, code);

    // Yangi raqam — mijoz sifatida ro'yxatdan o'tadi. Xodimlarni admin yaratadi.
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone, role: 'CUSTOMER', customerProfile: { create: {} } },
      update: { lastLoginAt: new Date() },
    });
    return this.session(user, userAgent);
  }

  /**
   * Telefon + parol (SMS o'rniga, vaqtincha).
   * Yangi raqam — mijoz sifatida shu parol bilan ro'yxatdan o'tadi.
   * Paroli yo'q mavjud hisob (seed, admin yaratgan xodim) — birinchi kirishda parol o'rnatiladi.
   */
  async loginWithPassword(phone: string, password: string, userAgent?: string) {
    const failKey = `login:fail:${phone}`;
    const fails = Number(await this.redis.get(failKey));
    if (fails >= LOGIN_FAIL_LIMIT) {
      throw new AppException('LOGIN_RATE_LIMIT', 'Juda ko\'p urinish, keyinroq qayta urining', HttpStatus.TOO_MANY_REQUESTS, {
        retryAfter: Math.max(await this.redis.ttl(failKey), 1),
      });
    }

    const existing = await this.prisma.user.findUnique({ where: { phone }, omit: { passwordHash: false } });
    let user: User;
    if (!existing) {
      user = await this.prisma.user.create({
        data: { phone, role: 'CUSTOMER', passwordHash: await hashPassword(password), customerProfile: { create: {} } },
      });
    } else if (!existing.passwordHash) {
      user = await this.prisma.user.update({
        where: { id: existing.id },
        data: { passwordHash: await hashPassword(password), lastLoginAt: new Date() },
      });
    } else if (await verifyPassword(password, existing.passwordHash)) {
      user = await this.prisma.user.update({ where: { id: existing.id }, data: { lastLoginAt: new Date() } });
      await this.redis.del(failKey);
    } else {
      await this.redis.multi().incr(failKey).expire(failKey, LOGIN_FAIL_WINDOW, 'NX').exec();
      throw new AppException('INVALID_PASSWORD', 'Parol noto\'g\'ri', HttpStatus.UNAUTHORIZED);
    }
    return this.session(user, userAgent);
  }

  private async session(user: User, userAgent?: string) {
    if (!user.isActive) throw AppException.forbidden('Hisob bloklangan');

    const tokens = await this.tokens.issue(user, userAgent);
    return {
      ...tokens,
      user: { id: user.id, phone: user.phone, fullName: user.fullName, role: user.role, locale: user.locale },
      isNew: user.fullName === null,
    };
  }
}
