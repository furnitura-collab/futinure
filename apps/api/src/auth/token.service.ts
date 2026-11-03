import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@mebel/shared';
import { ENV, type Env } from '../config/env.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AccessPayload {
  sub: string;
  role: Role;
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
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role } satisfies AccessPayload);
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

    const { count } = await this.prisma.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      // Parallel refresh — ikkinchisi yutqazadi
      throw invalid();
    }
    return this.issue(session.user, userAgent, session.familyId);
  }

  async revoke(refreshToken: string) {
    await this.prisma.refreshSession.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function sha256(v: string) {
  return createHash('sha256').update(v).digest('hex');
}

function invalid() {
  return new AppException('INVALID_REFRESH_TOKEN', 'Sessiya tugagan, qayta kiring', HttpStatus.UNAUTHORIZED);
}
