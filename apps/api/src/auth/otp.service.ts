import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS } from '../redis/redis.module.js';
import { SmsSender } from './sms.sender.js';

const OTP_TTL_SECONDS = 180;
export const OTP_MAX_ATTEMPTS = 5;
const TEST_CODE = '000000';

/** [kalit, oyna (s), limit] */
const RATE_LIMITS: readonly [string, number, number][] = [
  ['min', 60, 1],
  ['hour', 3600, 5],
  ['day', 86400, 10],
];
const IP_LIMIT_PER_HOUR = 30;

@Injectable()
export class OtpService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly sms: SmsSender,
  ) {}

  async request(phone: string, ip?: string): Promise<{ expiresIn: number; retryAfter: number }> {
    const isTest = this.env.OTP_TEST_PHONES.includes(phone);
    if (!isTest) await this.checkRateLimit(phone, ip);

    const code = isTest ? TEST_CODE : String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.prisma.otpCode.create({
      data: {
        phone,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      },
    });
    if (!isTest) {
      await this.sms.send(phone, `Mebel Order: tasdiqlash kodi ${code}. Kodni hech kimga bermang.`);
    }
    return { expiresIn: OTP_TTL_SECONDS, retryAfter: 60 };
  }

  /** Muvaffaqiyatli bo'lsa kod ishlatilgan deb belgilanadi, aks holda xato tashlaydi */
  async verify(phone: string, code: string): Promise<void> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new AppException('OTP_EXPIRED', 'Kod muddati o\'tgan, yangisini so\'rang');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AppException('OTP_TOO_MANY_ATTEMPTS', 'Urinishlar tugadi, yangi kod so\'rang', HttpStatus.TOO_MANY_REQUESTS);
    }

    const expected = Buffer.from(otp.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      await this.prisma.otpCode.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new AppException('OTP_INVALID', 'Kod noto\'g\'ri', HttpStatus.BAD_REQUEST, {
        attemptsLeft: OTP_MAX_ATTEMPTS - otp.attempts - 1,
      });
    }

    // Ikki parallel so'rov bitta kodni ikki marta ishlata olmasin
    const { count } = await this.prisma.otpCode.updateMany({
      where: { id: otp.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw new AppException('OTP_EXPIRED', 'Kod allaqachon ishlatilgan');
  }

  private hash(phone: string, code: string) {
    return createHmac('sha256', this.env.OTP_PEPPER).update(`${phone}:${code}`).digest('hex');
  }

  private async checkRateLimit(phone: string, ip?: string) {
    for (const [name, window, limit] of RATE_LIMITS) {
      const key = `otp:${name}:${phone}`;
      const n = await this.incr(key, window);
      if (n > limit) {
        const ttl = await this.redis.ttl(key);
        throw new AppException('OTP_RATE_LIMIT', 'Juda ko\'p so\'rov, keyinroq urinib ko\'ring', HttpStatus.TOO_MANY_REQUESTS, {
          retryAfter: Math.max(ttl, 1),
        });
      }
    }
    if (ip) {
      const n = await this.incr(`otp:ip:${ip}`, 3600);
      if (n > IP_LIMIT_PER_HOUR) {
        throw new AppException('OTP_RATE_LIMIT', 'Juda ko\'p so\'rov', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
  }

  private async incr(key: string, windowSec: number) {
    const [[, n]] = (await this.redis.multi().incr(key).expire(key, windowSec, 'NX').exec()) as [[null, number]];
    return n;
  }
}
