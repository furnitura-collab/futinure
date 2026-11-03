import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/app-exception.js';
import type { Tx } from '../audit/audit.service.js';

/**
 * Buyurtma qatorini tranzaksiya oxirigacha qulflaydi (SELECT ... FOR UPDATE) va to'liq yuklaydi.
 * expectedVersion berilsa — foydalanuvchi ko'rgan versiya bilan solishtiriladi.
 */
export async function lockOrder(tx: Tx, orderId: string, expectedVersion?: number) {
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
  if (!locked.length) throw AppException.notFound('Buyurtma');

  const order = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
      customer: { select: { id: true, customerProfile: true } },
      _count: { select: { cuttingLists: true } },
    },
  });
  if (expectedVersion !== undefined && order.version !== expectedVersion) {
    throw new AppException(
      'ORDER_CONFLICT',
      'Buyurtma boshqa foydalanuvchi tomonidan o\'zgartirilgan. Sahifani yangilang',
      HttpStatus.CONFLICT,
      { expectedVersion, actualVersion: order.version },
    );
  }
  return order;
}

export type LockedOrder = Awaited<ReturnType<typeof lockOrder>>;
