import { Inject, Injectable } from '@nestjs/common';
import { RT, type Role } from '@mebel/shared';
import { ENV, type Env } from '../config/env.js';
import type { OutboxHandler } from '../events/outbox.dispatcher.js';
import type { OutboxEnvelope, OutboxEvents, OutboxType } from '../events/outbox.service.js';
import { serialize } from '../common/serialize.interceptor.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { DELIVERY_FAILED, formatSom, READY_FOR_PICKUP, STATUS_TEXT, TEXTS } from './messages.js';
import { NotificationsService } from './notifications.service.js';
import { escapeHtml, TelegramSender } from './senders.js';

type Handlers = { [T in OutboxType]: (e: OutboxEnvelope<T>) => Promise<void> };

/**
 * Hodisa → kanallar:
 *   real-time (admin panel va ochiq ilova), bildirishnoma + push (mijoz), Telegram (xodimlar guruhi).
 * Takroriy chaqiruvga chidamli: bildirishnoma (eventId, userId) bo'yicha bir marta; real-time takrori zararsiz.
 */
@Injectable()
export class EventRouter implements OutboxHandler {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramSender,
  ) {}

  async handle(event: OutboxEnvelope) {
    const handler = this.handlers[event.type] as (e: OutboxEnvelope) => Promise<void>;
    await handler(event);
  }

  private readonly handlers: Handlers = {
    'order.created': async ({ payload }) => {
      const o = await this.order(payload.orderId);
      const card = serialize({ id: o.id, number: o.number, status: o.status, grandTotal: o.grandTotal, customer: o.customer, createdAt: o.createdAt });
      this.realtime.toStaff(RT.ORDER_CREATED, card);
      await this.tg(
        `🆕 <b>Yangi buyurtma ${o.number}</b>\n${this.who(o.customer)}\n${o._count.items} xil tovar, ${formatSom(o.grandTotal)}\n` +
          `${o.deliveryType === 'PICKUP' ? '🏬 Olib ketadi' : '🚚 Yetkazish'}\n${this.link(o.id)}`,
      );
    },

    'order.status_changed': async ({ id, payload }) => {
      const o = await this.order(payload.orderId);
      const data = serialize({ orderId: o.id, number: o.number, from: payload.from, to: payload.to, version: o.version });
      this.realtime.toStaff(RT.ORDER_STATUS_CHANGED, data);
      this.realtime.toUser(o.customerId, RT.ORDER_STATUS_CHANGED, data);
      this.realtime.toOrder(o.id, RT.ORDER_STATUS_CHANGED, data);

      const failed = payload.from === 'OUT_FOR_DELIVERY' && payload.to === 'READY';
      if (failed) {
        await this.tg(`🚫 <b>Yetkazilmadi: ${o.number}</b>\n${this.who(o.customer)}\n💬 ${escapeHtml(payload.comment ?? '')}\n${this.link(o.id)}`);
      }

      const actorRole = payload.actorId ? await this.roleOf(payload.actorId) : null;
      const byCustomer = actorRole === 'CUSTOMER';

      // Mijozning o'z harakati — unga emas, xodimlarga xabar
      if (byCustomer) {
        const what =
          payload.to === 'CONFIRMED' ? '✅ Mijoz taklifni qabul qildi' :
          payload.to === 'NEW' ? '↩️ Mijoz taklifni rad etdi' :
          payload.to === 'CANCELLED' ? '❌ Mijoz buyurtmani bekor qildi' : null;
        if (what) {
          await this.tg(`${what}: <b>${o.number}</b>\n${this.who(o.customer)}${payload.comment ? `\n💬 ${escapeHtml(payload.comment)}` : ''}\n${this.link(o.id)}`);
        }
        return;
      }

      // QUOTED haqida mijozga "order.quote_created" xabar beradi; COMPLETED — to'lov xabari bilan
      if (payload.to === 'QUOTED' || payload.to === 'COMPLETED') return;
      // NEW ga faqat taklif muddati o'tganda (tizim) qaytadi
      if (payload.to === 'NEW' && payload.actorId !== null) return;

      const template = failed
        ? DELIVERY_FAILED
        : payload.to === 'READY' && o.deliveryType === 'PICKUP'
          ? READY_FOR_PICKUP
          : STATUS_TEXT[payload.to];
      if (!template) return;
      await this.notifications.notify({
        eventId: id,
        userId: o.customerId,
        type: failed ? 'order.delivery_failed' : `order.${payload.to.toLowerCase()}`,
        template,
        params: { number: o.number, total: { som: o.grandTotal }, comment: payload.comment ?? '' },
        payload: { orderId: o.id },
      });
    },

    'order.quote_created': async ({ id, payload }) => {
      const o = await this.order(payload.orderId);
      const quote = await this.prisma.orderQuote.findUniqueOrThrow({ where: { id: payload.quoteId }, select: { totals: true } });
      const data = { orderId: o.id, quoteId: payload.quoteId };
      this.realtime.toUser(o.customerId, RT.ORDER_QUOTE_CREATED, data);
      this.realtime.toOrder(o.id, RT.ORDER_QUOTE_CREATED, data);
      await this.notifications.notify({
        eventId: id,
        userId: o.customerId,
        type: 'order.quote',
        template: TEXTS.quote,
        // Taklifdagi yangi summa (buyurtma summasi qabul qilinganda o'zgaradi)
        params: { number: o.number, total: { som: (quote.totals as { grandTotal: number }).grandTotal } },
        payload: { orderId: o.id, quoteId: payload.quoteId },
      });
    },

    'payment.created': async ({ payload }) => {
      const p = await this.payment(payload.paymentId);
      this.realtime.toStaff(RT.PAYMENT_CREATED, serialize(p));
      await this.tg(
        `${p.method === 'CASH' ? '💵 <b>Haydovchi naqd oldi' : '💳 <b>Yangi chek'}: ${formatSom(p.amount)}</b>\n${this.who(p.customer)}\n` +
          `${p.order ? `Buyurtma ${p.order.number}` : 'Umumiy qarzga'}\n${this.env.ADMIN_URL}/payments?status=PENDING`,
      );
    },

    'payment.confirmed': async ({ id, payload }) => {
      const p = await this.payment(payload.paymentId);
      this.paymentUpdated(p);
      await this.notifications.notify({
        eventId: id,
        userId: p.customerId,
        type: 'payment.confirmed',
        template: TEXTS.paymentConfirmed,
        params: { amount: { som: p.amount }, order: p.order ? ` (${p.order.number})` : '' },
        payload: { paymentId: p.id, orderId: p.orderId },
      });
    },

    'payment.rejected': async ({ id, payload }) => {
      const p = await this.payment(payload.paymentId);
      this.paymentUpdated(p);
      await this.notifications.notify({
        eventId: id,
        userId: p.customerId,
        type: 'payment.rejected',
        template: TEXTS.paymentRejected,
        params: { amount: { som: p.amount }, reason: p.rejectReason ?? '' },
        payload: { paymentId: p.id, orderId: p.orderId },
      });
    },

    'chat.message': async ({ id, payload }) => {
      const m = await this.prisma.chatMessage.findUnique({
        where: { id: payload.messageId },
        include: {
          sender: { select: { id: true, fullName: true, role: true } },
          order: { select: { id: true, number: true, customerId: true } },
          attachment: { select: { id: true, mimeType: true, size: true } },
        },
      });
      if (!m) return;
      const { order, ...message } = m;
      const data = serialize({ ...message, orderNumber: order.number });
      this.realtime.toOrder(order.id, RT.CHAT_MESSAGE, data);

      if (m.sender.role === 'CUSTOMER') {
        // Admin panelda ro'yxatdagi "o'qilmagan" belgisi uchun
        this.realtime.toStaff(RT.CHAT_MESSAGE, data);
        return;
      }
      this.realtime.toUser(order.customerId, RT.CHAT_MESSAGE, data);
      await this.notifications.notify({
        eventId: id,
        userId: order.customerId,
        type: 'chat.message',
        template: TEXTS.chat,
        params: { number: order.number, text: m.text ? m.text.slice(0, 120) : '📎' },
        payload: { orderId: order.id, messageId: m.id },
      });
    },

    'delivery.assigned': async ({ id, payload }) => {
      const o = await this.prisma.order.findUnique({ where: { id: payload.orderId }, select: { id: true, number: true, addressSnapshot: true } });
      if (!o) return;
      const data = { orderId: o.id, driverId: payload.driverId };
      this.realtime.toStaff(RT.DELIVERY_ASSIGNED, data);
      if (payload.previousDriverId) this.realtime.toUser(payload.previousDriverId, RT.DELIVERY_ASSIGNED, data);
      if (!payload.driverId) return;
      this.realtime.toUser(payload.driverId, RT.DELIVERY_ASSIGNED, data);
      const address = (o.addressSnapshot as { addressText?: string } | null)?.addressText ?? '';
      await this.notifications.notify({
        // Bir buyurtma bir haydovchiga qayta biriktirilsa ham har safar xabar (hodisa id'si bo'yicha)
        eventId: id,
        userId: payload.driverId,
        type: 'delivery.assigned',
        template: TEXTS.deliveryAssigned,
        params: { number: o.number, address },
        payload: { orderId: o.id },
      });
    },

    'chat.read': async ({ payload }) => {
      const o = await this.prisma.order.findUnique({ where: { id: payload.orderId }, select: { id: true, customerId: true } });
      if (!o) return;
      this.realtime.toOrder(o.id, RT.CHAT_READ, payload);
      if (payload.readerRole === 'STAFF') this.realtime.toStaff(RT.CHAT_READ, payload);
    },
  };

  // ───── yordamchilar ─────

  private order(id: string) {
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        customer: { select: { id: true, phone: true, fullName: true, customerProfile: { select: { companyName: true } } } },
        _count: { select: { items: { where: { status: 'ACTIVE' } } } },
      },
    });
  }

  private payment(id: string) {
    return this.prisma.payment.findUniqueOrThrow({
      where: { id },
      include: {
        order: { select: { id: true, number: true, paidTotal: true, grandTotal: true } },
        customer: { select: { id: true, phone: true, fullName: true, customerProfile: { select: { companyName: true } } } },
      },
    });
  }

  private paymentUpdated(p: Awaited<ReturnType<EventRouter['payment']>>) {
    const data = serialize({ id: p.id, status: p.status, amount: p.amount, orderId: p.orderId, rejectReason: p.rejectReason });
    this.realtime.toUser(p.customerId, RT.PAYMENT_UPDATED, data);
    this.realtime.toStaff(RT.PAYMENT_UPDATED, data);
    if (p.orderId) this.realtime.toOrder(p.orderId, RT.PAYMENT_UPDATED, data);
  }

  private async roleOf(userId: string): Promise<Role | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    return u?.role ?? null;
  }

  private who(c: { fullName: string | null; phone: string; customerProfile: { companyName: string | null } | null }) {
    const name = [c.fullName, c.customerProfile?.companyName].filter(Boolean).join(', ');
    return `👤 ${escapeHtml(name || 'Ismsiz')} · ${c.phone}`;
  }

  private link(orderId: string) {
    return `${this.env.ADMIN_URL}/orders/${orderId}`;
  }

  /** Telegram — imkon qadar; xatosi hodisani qayta urinishga olib kelmaydi (dublikat xabar bo'lmasin) */
  private async tg(html: string) {
    try {
      await this.telegram.send(html);
    } catch {
      // senders o'zi logga yozadi
    }
  }
}

