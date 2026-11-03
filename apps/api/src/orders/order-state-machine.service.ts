import { HttpStatus, Injectable } from '@nestjs/common';
import { checkTransition, type DeliveryType, type OrderStatus } from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService, type Tx } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { OutboxService } from '../events/outbox.service.js';

export interface TransitionTarget {
  id: string;
  status: OrderStatus;
  version: number;
  deliveryType: DeliveryType;
}

const REASON_MESSAGES = {
  NO_SUCH_TRANSITION: 'Bu statusdan bunday o\'tish mumkin emas',
  FORBIDDEN_ROLE: 'Bu amal uchun ruxsat yo\'q',
  WRONG_DELIVERY_TYPE: 'Yetkazish turiga mos emas',
  COMMENT_REQUIRED: 'Sabab yoki izoh majburiy',
} as const;

/**
 * Buyurtma statusini o'zgartirishning YAGONA joyi (docs/02-state-machine.md).
 * To'g'ridan-to'g'ri `order.update({ status })` taqiqlanadi.
 *
 * Bu servis faqat umumiy qismni bajaradi: qoida tekshiruvi, optimistic lock, tarix, audit.
 * O'tishga xos yon ta'sirlar (rezerv, ledger) chaqiruvchi tomonidan o'sha tranzaksiyada qilinadi.
 */
@Injectable()
export class OrderStateMachine {
  constructor(
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async transition(
    tx: Tx,
    order: TransitionTarget,
    to: OrderStatus,
    actor: AuthUser | null,
    opts: { comment?: string | null; data?: Prisma.OrderUncheckedUpdateManyInput } = {},
  ): Promise<number> {
    const check = checkTransition({
      from: order.status,
      to,
      role: actor?.role ?? null,
      deliveryType: order.deliveryType,
      comment: opts.comment,
    });
    if (!check.ok) {
      const status = check.reason === 'FORBIDDEN_ROLE' ? HttpStatus.FORBIDDEN : HttpStatus.CONFLICT;
      throw new AppException(`TRANSITION_${check.reason}`, REASON_MESSAGES[check.reason], status, {
        from: order.status,
        to,
      });
    }

    const now = new Date();
    const timestamps: Prisma.OrderUncheckedUpdateManyInput = {
      ...(to === 'CONFIRMED' && { confirmedAt: now }),
      ...(to === 'DELIVERED' && { deliveredAt: now }),
      ...(to === 'COMPLETED' && { completedAt: now }),
      ...(to === 'CANCELLED' && { cancelledAt: now, cancelReason: opts.comment ?? null, cancelledBy: actor?.id ?? null }),
    };

    // Optimistic lock: boshqa birov orada o'zgartirgan bo'lsa — 409
    const { count } = await tx.order.updateMany({
      where: { id: order.id, version: order.version, status: order.status },
      data: { ...opts.data, ...timestamps, status: to, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new AppException('ORDER_CONFLICT', 'Buyurtma boshqa foydalanuvchi tomonidan o\'zgartirilgan. Sahifani yangilang', HttpStatus.CONFLICT);
    }

    await tx.orderStatusHistory.create({
      data: { orderId: order.id, fromStatus: order.status, toStatus: to, actorId: actor?.id ?? null, comment: opts.comment ?? null },
    });
    await this.audit.log(
      { actorId: actor?.id ?? null, entity: 'order', entityId: order.id, action: `status:${order.status}>${to}`, after: { comment: opts.comment } },
      tx,
    );
    // Har o'tish xabar beradi (mijozga push, adminga real-time) — shu tranzaksiyada
    await this.outbox.add(tx, 'order.status_changed', {
      orderId: order.id,
      from: order.status,
      to,
      actorId: actor?.id ?? null,
      comment: opts.comment ?? null,
    });
    return order.version + 1;
  }
}
