import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { REDIS } from '../redis/redis.module.js';

export abstract class SmsSender {
  abstract send(phone: string, text: string): Promise<void>;
}

/** Dev: SMS yubormaydi, logga chiqaradi */
@Injectable()
export class ConsoleSmsSender extends SmsSender {
  private readonly logger = new Logger('SMS');

  async send(phone: string, text: string) {
    this.logger.log(`${phone}: ${text}`);
  }
}

/**
 * Eskiz.uz. Diqqat: Eskiz faqat oldindan tasdiqlangan shablonli matnlarni yuboradi,
 * OTP matni kabinetda shablon sifatida tasdiqlangan bo'lishi kerak.
 */
@Injectable()
export class EskizSmsSender extends SmsSender {
  private static readonly BASE = 'https://notify.eskiz.uz/api';
  private static readonly TOKEN_KEY = 'eskiz:token';
  private readonly logger = new Logger('Eskiz');

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(REDIS) private readonly redis: Redis,
  ) {
    super();
  }

  async send(phone: string, text: string) {
    let res = await this.post(phone, text, await this.token());
    if (res.status === 401) {
      res = await this.post(phone, text, await this.token(true));
    }
    if (!res.ok) {
      this.logger.error(`SMS yuborilmadi ${res.status}: ${await res.text()}`);
      throw new Error('SMS_SEND_FAILED');
    }
  }

  private post(phone: string, text: string, token: string) {
    const body = new FormData();
    body.set('mobile_phone', phone.replace('+', ''));
    body.set('message', text);
    body.set('from', this.env.ESKIZ_FROM);
    return fetch(`${EskizSmsSender.BASE}/message/sms/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
      signal: AbortSignal.timeout(10_000),
    });
  }

  private async token(force = false): Promise<string> {
    if (!force) {
      const cached = await this.redis.get(EskizSmsSender.TOKEN_KEY);
      if (cached) return cached;
    }
    const body = new FormData();
    body.set('email', this.env.ESKIZ_EMAIL ?? '');
    body.set('password', this.env.ESKIZ_PASSWORD ?? '');
    const res = await fetch(`${EskizSmsSender.BASE}/auth/login`, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Eskiz login xato: ${res.status}`);
    const json = (await res.json()) as { data?: { token?: string } };
    const token = json.data?.token;
    if (!token) throw new Error('Eskiz token qaytarmadi');
    // Token 30 kun amal qiladi, biz 25 kun saqlaymiz
    await this.redis.set(EskizSmsSender.TOKEN_KEY, token, 'EX', 25 * 24 * 3600);
    return token;
  }
}
