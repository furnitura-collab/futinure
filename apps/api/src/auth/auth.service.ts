import { Injectable } from '@nestjs/common';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  async verifyOtp(phone: string, code: string, userAgent?: string) {
    await this.otp.verify(phone, code);

    // Yangi raqam — mijoz sifatida ro'yxatdan o'tadi. Xodimlarni admin yaratadi.
    const user = await this.prisma.user.upsert({
      where: { phone },
      create: { phone, role: 'CUSTOMER', customerProfile: { create: {} } },
      update: { lastLoginAt: new Date() },
    });
    if (!user.isActive) throw AppException.forbidden('Hisob bloklangan');

    const tokens = await this.tokens.issue(user, userAgent);
    return {
      ...tokens,
      user: { id: user.id, phone: user.phone, fullName: user.fullName, role: user.role, locale: user.locale },
      isNew: user.fullName === null,
    };
  }
}
