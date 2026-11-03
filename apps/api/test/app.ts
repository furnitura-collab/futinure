import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Redis } from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';
import { SmsSender } from '../src/auth/sms.sender.js';
import { PushSender, TelegramSender, type PushMessage } from '../src/notifications/senders.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { REDIS } from '../src/redis/redis.module.js';

/** Yuborilgan SMS'larni ushlab qoladi */
export class FakeSms extends SmsSender {
  sent: { phone: string; text: string }[] = [];

  async send(phone: string, text: string) {
    this.sent.push({ phone, text });
  }

  lastCode(phone: string): string {
    const msg = this.sent.findLast((m) => m.phone === phone);
    const code = msg?.text.match(/\d{6}/)?.[0];
    if (!code) throw new Error(`${phone} uchun SMS yo'q`);
    return code;
  }
}

export class FakePush extends PushSender {
  sent: PushMessage[] = [];
  /** Shu tokenlar "ilova o'chirilgan" deb qaytariladi */
  invalid = new Set<string>();

  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return { invalidTokens: messages.map((m) => m.to).filter((t) => this.invalid.has(t)) };
  }
}

export class FakeTelegram extends TelegramSender {
  messages: string[] = [];

  async send(html: string) {
    this.messages.push(html);
  }
}

export interface TestContext {
  app: INestApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  redis: Redis;
  sms: FakeSms;
  push: FakePush;
  telegram: FakeTelegram;
}

export async function createTestApp(): Promise<TestContext> {
  const sms = new FakeSms();
  const push = new FakePush();
  const telegram = new FakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SmsSender)
    .useValue(sms)
    .overrideProvider(PushSender)
    .useValue(push)
    .overrideProvider(TelegramSender)
    .useValue(telegram)
    .compile();

  const app = setupApp(moduleRef.createNestApplication<NestExpressApplication>());
  // Doimiy tinglaydi: aks holda supertest har so'rovda serverni ochib-yopadi va
  // parallel/ichma-ich so'rovlar bir-birining serverini yopib qo'yadi
  await app.listen(0, '127.0.0.1');
  return {
    app,
    http: request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    redis: app.get(REDIS),
    sms,
    push,
    telegram,
  };
}

/** Jadvallarni tozalaydi (migratsiyalar jadvalidan tashqari) */
export async function resetDb(ctx: TestContext) {
  const tables = await ctx.prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await ctx.prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await ctx.redis.flushdb();
  ctx.sms.sent = [];
  ctx.push.sent = [];
  ctx.push.invalid.clear();
  ctx.telegram.messages = [];
}

/** OTP orqali kirib, token qaytaradi */
export async function login(ctx: TestContext, phone: string) {
  await ctx.http.post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await ctx.http
    .post('/api/v1/auth/otp/verify')
    .send({ phone, code: ctx.sms.lastCode(phone) })
    .expect(200);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string; role: string } };
}
