import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  /** Endi yaroqsiz tokenlar (ilova o'chirilgan) — bazadan o'chiriladi */
  invalidTokens: string[];
}

export abstract class PushSender {
  abstract send(messages: PushMessage[]): Promise<PushResult>;
}

@Injectable()
export class ConsolePushSender extends PushSender {
  private readonly logger = new Logger('Push');

  async send(messages: PushMessage[]): Promise<PushResult> {
    for (const m of messages) this.logger.log(`${m.to.slice(0, 24)}…: ${m.title} — ${m.body}`);
    return { invalidTokens: [] };
  }
}

/** Expo Push API: https://docs.expo.dev/push-notifications/sending-notifications/ */
@Injectable()
export class ExpoPushSender extends PushSender {
  private static readonly URL = 'https://exp.host/--/api/v2/push/send';
  private static readonly CHUNK = 100;
  private readonly logger = new Logger('ExpoPush');

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async send(messages: PushMessage[]): Promise<PushResult> {
    const invalidTokens: string[] = [];
    for (let i = 0; i < messages.length; i += ExpoPushSender.CHUNK) {
      const chunk = messages.slice(i, i + ExpoPushSender.CHUNK);
      const res = await fetch(ExpoPushSender.URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(this.env.EXPO_ACCESS_TOKEN && { Authorization: `Bearer ${this.env.EXPO_ACCESS_TOKEN}` }),
        },
        body: JSON.stringify(chunk.map((m) => ({ ...m, sound: 'default', channelId: 'default' }))),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.error(`Expo ${res.status}: ${await res.text()}`);
        continue;
      }
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      json.data?.forEach((ticket, idx) => {
        if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
          invalidTokens.push(chunk[idx]!.to);
        }
      });
    }
    return { invalidTokens };
  }
}

export abstract class TelegramSender {
  abstract send(html: string): Promise<void>;
}

@Injectable()
export class ConsoleTelegramSender extends TelegramSender {
  private readonly logger = new Logger('Telegram');

  async send(html: string) {
    this.logger.log(html.replace(/<[^>]+>/g, ''));
  }
}

@Injectable()
export class BotTelegramSender extends TelegramSender {
  private readonly logger = new Logger('TelegramBot');

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async send(html: string) {
    const res = await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.env.TELEGRAM_CHAT_ID,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) this.logger.error(`Telegram ${res.status}: ${await res.text()}`);
  }
}

/** Telegram HTML uchun foydalanuvchi matnini ekranlash */
export function escapeHtml(s: string) {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
