import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { OutboxEnvelope } from './outbox.service.js';

export const OUTBOX_HANDLER = Symbol('OUTBOX_HANDLER');

export interface OutboxHandler {
  handle(event: OutboxEnvelope): Promise<void>;
}

const POLL_MS = 500;
const BATCH = 50;
const MAX_ATTEMPTS = 8;

/**
 * Outbox'dan hodisalarni o'qib, handler'ga beradi.
 * - FOR UPDATE SKIP LOCKED: bir nechta API nusxasi bir hodisani ikki marta olmaydi.
 * - Xato bo'lsa — eksponensial kechikish bilan qayta urinish, MAX_ATTEMPTS dan keyin to'xtaydi.
 * - Kamida bir marta (at-least-once): handler'lar takroriy chaqiruvga chidamli bo'lishi kerak.
 * Testlarda o'chiq — drain() to'g'ridan-to'g'ri chaqiriladi.
 */
@Injectable()
export class OutboxDispatcher implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxDispatcher.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(OUTBOX_HANDLER) private readonly handler: OutboxHandler,
    private readonly prisma: PrismaService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.drain();
    } catch (e) {
      this.logger.error('Outbox xatosi', e as Error);
    } finally {
      this.running = false;
    }
  }

  /** Navbatdagi barcha hodisalarni qayta ishlaydi. @returns qayta ishlanganlar soni */
  async drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await this.processBatch();
      total += n;
      if (n < BATCH) return total;
    }
  }

  private async processBatch(): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        // Vaqtni ilova soati bilan solishtiramiz: next_attempt_at ham ilovada yoziladi (Prisma @default(now())),
        // DB soati bir necha ms orqada bo'lsa yangi hodisa o'tkazib yuborilmasin
        const rows = await tx.$queryRaw<{ id: string; type: string; payload: unknown; attempts: number; created_at: Date }[]>`
          SELECT id, type, payload, attempts, created_at FROM outbox_events
          WHERE processed_at IS NULL AND next_attempt_at <= ${new Date()}
          ORDER BY created_at, id
          LIMIT ${BATCH}
          FOR UPDATE SKIP LOCKED`;

        for (const row of rows) {
          const event = { id: row.id, type: row.type, payload: row.payload, createdAt: row.created_at } as OutboxEnvelope;
          try {
            await this.handler.handle(event);
            await tx.outboxEvent.update({ where: { id: row.id }, data: { processedAt: new Date(), attempts: { increment: 1 } } });
          } catch (e) {
            const attempts = row.attempts + 1;
            const giveUp = attempts >= MAX_ATTEMPTS;
            this.logger.error(`Hodisa ${row.type} ${row.id} (${attempts}-urinish)${giveUp ? ' — to\'xtatildi' : ''}`, e as Error);
            await tx.outboxEvent.update({
              where: { id: row.id },
              data: {
                attempts,
                lastError: String((e as Error).message ?? e).slice(0, 1000),
                nextAttemptAt: new Date(Date.now() + 2 ** attempts * 1000),
                ...(giveUp && { processedAt: new Date() }),
              },
            });
          }
        }
        return rows.length;
      },
      { timeout: 60_000 },
    );
  }
}
