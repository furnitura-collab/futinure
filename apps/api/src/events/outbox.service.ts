import { Global, Injectable, Module } from '@nestjs/common';
import type { OrderStatus } from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import type { Tx } from '../audit/audit.service.js';

/** Hodisa turlari va ularning ma'lumoti. Ma'lumot minimal — handler kerakli narsani bazadan o'qiydi */
export interface OutboxEvents {
  'order.created': { orderId: string };
  'order.status_changed': { orderId: string; from: OrderStatus; to: OrderStatus; actorId: string | null; comment: string | null };
  'order.quote_created': { orderId: string; quoteId: string };
  'payment.created': { paymentId: string };
  'payment.confirmed': { paymentId: string };
  'payment.rejected': { paymentId: string };
  'chat.message': { messageId: string };
  'chat.read': { orderId: string; readerRole: 'CUSTOMER' | 'STAFF' };
  'delivery.assigned': { orderId: string; driverId: string | null; previousDriverId: string | null };
}

export type OutboxType = keyof OutboxEvents;

export interface OutboxEnvelope<T extends OutboxType = OutboxType> {
  id: string;
  type: T;
  payload: OutboxEvents[T];
  createdAt: Date;
}

/**
 * Transactional outbox. Hodisa biznes o'zgarishi bilan BIR tranzaksiyada yoziladi:
 * tranzaksiya bekor bo'lsa — xabar ham ketmaydi; server yiqilsa — xabar yo'qolmaydi.
 */
@Injectable()
export class OutboxService {
  async add<T extends OutboxType>(tx: Tx, type: T, payload: OutboxEvents[T]) {
    await tx.outboxEvent.create({ data: { type, payload: payload as unknown as Prisma.InputJsonValue } });
  }
}

@Global()
@Module({ providers: [OutboxService], exports: [OutboxService] })
export class OutboxModule {}
