import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { addDays, businessDate } from '@mebel/shared';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TEXTS } from './messages.js';
import { NotificationsService, stableUuid } from './notifications.service.js';

const INTERVAL_MS = 60 * 60_000;
const SOON_DAYS = 2;
const OVERDUE_EVERY_DAYS = 3;

/**
 * Nasiya eslatmalari: muddatdan 2 kun oldin, muddat kuni va keyin har 3 kunda.
 * Har soat ishlaydi; bir buyurtmaga bir kunda bitta eslatma (stableUuid kaliti).
 */
@Injectable()
export class DebtReminderScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DebtReminderScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.run().catch((e) => this.logger.error(e)), INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  /** @returns yuborilgan eslatmalar soni */
  async run(today = businessDate()): Promise<number> {
    const orders = await this.prisma.$queryRaw<
      { id: string; number: string; customer_id: string; due: bigint; due_date: Date; days_left: number }[]
    >`
      SELECT id, number, customer_id, (grand_total - paid_total)::bigint AS due, due_date,
             (due_date - ${today}::date)::int AS days_left
      FROM orders
      WHERE payment_terms = 'CREDIT' AND status IN ('DELIVERED', 'COMPLETED')
        AND grand_total > paid_total AND due_date IS NOT NULL
        AND due_date <= ${addDays(today, SOON_DAYS)}::date`;

    let sent = 0;
    for (const o of orders) {
      const overdueDays = -o.days_left;
      const remind =
        o.days_left === SOON_DAYS || o.days_left === 0 || (overdueDays > 0 && overdueDays % OVERDUE_EVERY_DAYS === 0);
      if (!remind) continue;
      const ok = await this.notifications.notify({
        eventId: stableUuid(`debt:${o.id}:${today}`),
        userId: o.customer_id,
        type: overdueDays > 0 ? 'debt.overdue' : 'debt.soon',
        template: overdueDays > 0 ? TEXTS.debtOverdue : TEXTS.debtSoon,
        params: { number: o.number, amount: { som: o.due }, due: o.due_date.toISOString().slice(0, 10) },
        payload: { orderId: o.id },
      });
      if (ok) sent++;
    }
    return sent;
  }
}
