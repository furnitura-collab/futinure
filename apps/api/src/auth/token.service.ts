import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@mebel/shared';
import { ENV, type Env } from '../config/env.js';
import { AppException } from '../common/app-exception.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AccessPayload {
  sub: string;
  role: Role;
  /** Refresh sessiya oilasi — "boshqa sessiyalarni yopish" uchun joriy sessiyani ajratadi */
  fam?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async issue(user: { id: string; role: Role }, userAgent?: string, familyId: string = randomUUID()): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        familyId,
        userAgent: userAgent?.slice(0, 300),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_DAYS * 86_400_000),
      },
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role, fam: familyId } satisfies AccessPayload);
    return { accessToken, refreshToken };
  }

  /**
   * Rotatsiya: eski token bekor qilinadi, yangisi beriladi.
   * Bekor qilingan token qayta kelsa — o'g'irlangan deb hisoblab, butun oilani bekor qilamiz.
   */
  async rotate(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: { select: { id: true, role: true, isActive: true } } },
    });
    if (!session) throw invalid();

    if (session.revokedAt) {
      await this.revokeFamily(session.familyId);
      throw invalid();
    }
    if (session.expiresAt < new Date() || !session.user.isActive) throw invalid();

    // Parallel refresh — ikkinchisi yutqazadi
    if ((await this.revokeWhere({ id: session.id })) === 0) throw invalid();
    return this.issue(session.user, userAgent, session.familyId);
  }

  async revoke(refreshToken: string) {
    await this.revokeWhere({ tokenHash: sha256(refreshToken) });
  }

  /** `exceptFamilyId` — joriy qurilma sessiyasi saqlanadi */
  async revokeAllForUser(userId: string, exceptFamilyId?: string) {
    await this.revokeWhere({ userId, ...(exceptFamilyId && { familyId: { not: exceptFamilyId } }) });
  }

  private async revokeFamily(familyId: string) {
    await this.revokeWhere({ familyId });
  }

  private async revokeWhere(where: Prisma.RefreshSessionWhereInput) {
    const { count } = await this.prisma.refreshSession.updateMany({
      where: { ...where, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }
}

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex');
}

function invalid() {
  return AppException.unauthorized('INVALID_REFRESH_TOKEN', 'Sessiya tugagan, qayta kiring');
}
