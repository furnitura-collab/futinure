import { Injectable } from '@nestjs/common';
import type { DeviceTokenInput, UpdateMe } from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import type { AuthUser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phone: true,
        fullName: true,
        role: true,
        locale: true,
        customerProfile: {
          select: {
            type: true,
            companyName: true,
            inn: true,
            creditLimit: true,
            paymentTermDays: true,
            allowedPaymentMethods: true,
            balanceCached: true,
            priceGroup: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!user) throw AppException.notFound('Foydalanuvchi');
    return user;
  }

  async update(user: AuthUser, input: UpdateMe) {
    const { fullName, locale, customerType, companyName, inn } = input;
    const profileData = { type: customerType, companyName, inn };
    const touchesProfile = Object.values(profileData).some((v) => v !== undefined);
    if (touchesProfile && user.role !== 'CUSTOMER') {
      throw AppException.forbidden('Xodim profilida mijoz maydonlari yo\'q');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        fullName,
        locale,
        ...(touchesProfile && { customerProfile: { update: profileData } }),
      },
    });
    return this.get(user.id);
  }

  async addDevice(userId: string, input: DeviceTokenInput) {
    // Token boshqa foydalanuvchida bo'lsa (qurilmada akkaunt almashgan) — ko'chiriladi
    await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: { userId, token: input.token, platform: input.platform },
      update: { userId, platform: input.platform, lastSeenAt: new Date() },
    });
  }

  async removeDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }
}
