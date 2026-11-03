import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RT, type Locale } from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { formatSom, render } from './messages.js';
import { PushSender } from './senders.js';

export interface NotifyInput {
  /** Dublikatga qarshi kalit: bir hodisa bir foydalanuvchiga faqat bir marta */
  eventId: string;
  userId: string;
  type: string;
  template: Parameters<typeof render>[0];
  /** Pul — { som } ko'rinishida: foydalanuvchi tiliga qarab formatlanadi */
  params: Record<string, string | { som: number | bigint }>;
  payload?: Record<string, unknown>;
}

/** Matndan barqaror UUID (outbox'siz eslatmalar uchun dublikat kaliti) */
export function stableUuid(key: string) {
  const h = createHash('sha1').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Bildirishnoma: bazaga (ilovadagi "qo'ng'iroqcha"), real-time va push.
 * Baza — asosiy; push va real-time "imkon qadar" (xatosi hodisani to'xtatmaydi).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushSender,
    private readonly realtime: RealtimeService,
  ) {}

  async notify(input: NotifyInput): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { locale: true, isActive: true, devices: { select: { token: true } } },
    });
    if (!user?.isActive) return false;

    const locale = user.locale as Locale;
    const params = Object.fromEntries(
      Object.entries(input.params).map(([k, v]) => [k, typeof v === 'string' ? v : formatSom(v.som, locale)]),
    );
    const { title, body } = render(input.template, locale, params);
    const { count } = await this.prisma.notification.createMany({
      data: [
        {
          eventId: input.eventId,
          userId: input.userId,
          type: input.type,
          title,
          body,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return false; // takroriy hodisa — allaqachon yuborilgan

    const created = await this.prisma.notification.findUniqueOrThrow({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
    });
    this.realtime.toUser(input.userId, RT.NOTIFICATION, created);

    if (user.devices.length) {
      try {
        const { invalidTokens } = await this.push.send(
          user.devices.map((d) => ({ to: d.token, title, body, data: { type: input.type, ...input.payload } })),
        );
        if (invalidTokens.length) await this.prisma.deviceToken.deleteMany({ where: { token: { in: invalidTokens } } });
      } catch (e) {
        this.logger.warn(`Push yuborilmadi: ${(e as Error).message}`);
      }
    }
    return true;
  }

  async list(userId: string, page: number, limit: number) {
    const where = { userId };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        omit: { eventId: true },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, total, page, limit, unread };
  }

  async markRead(userId: string, ids: string[] | undefined) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids && { id: { in: ids } }) },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }
}
