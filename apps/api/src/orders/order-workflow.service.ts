import { HttpStatus, Injectable } from '@nestjs/common';
import { addDays, businessDate, computeOrderTotals, type TransitionInput } from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import type { Tx } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderInventoryService } from './order-inventory.service.js';
import { lockOrder, type LockedOrder } from './order-lock.js';
import { OrderStateMachine } from './order-state-machine.service.js';
import { termsData, validateTerms } from './order-terms.js';

/**
 * Status o'tishlari va ularning yon ta'sirlari (docs/02-state-machine.md, "O'tishlar jadvali").
 * Har o'tish bitta tranzaksiyada: status + rezerv/qoldiq + ledger + tarix + audit.
 */
@Injectable()
export class OrderWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: OrderStateMachine,
    private readonly inventory: OrderInventoryService,
    private readonly ledger: LedgerService,
  ) {}

  async transition(orderId: string, input: TransitionInput, actor: AuthUser) {
    return this.prisma.$transaction((tx) => this.apply(tx, orderId, input, actor), { timeout: 20_000 });
  }

  /** Tashqi tranzaksiya ichida (haydovchi topshirishi: status + surat + naqd pul bitta tranzaksiyada) */
  async apply(tx: Tx, orderId: string, input: TransitionInput, actor: AuthUser) {
    const order = await lockOrder(tx, orderId, input.expectedVersion);
    // Haydovchi faqat o'ziga biriktirilgan buyurtmani ko'radi va o'zgartiradi
    if (actor.role === 'DRIVER') {
      const d = await tx.delivery.findUnique({ where: { orderId }, select: { driverId: true } });
      if (d?.driverId !== actor.id) throw AppException.notFound('Buyurtma');
    }
    // Xodim o'zi tegishli bo'lmagan buyurtmaga ham tegishi mumkin; birinchi tekkan menejer biriktiriladi
    const assign =
      !order.managerId && (actor.role === 'MANAGER' || actor.role === 'SUPER_ADMIN') ? { managerId: actor.id } : {};

    switch (input.to) {
      case 'QUOTED':
        throw new AppException('USE_QUOTE_ENDPOINT', 'Taklif uchun /quotes endpointidan foydalaning');
      case 'NEW':
        throw new AppException('USE_QUOTE_ENDPOINT', 'Taklifni faqat mijoz rad etadi');
      case 'CONFIRMED':
        return this.confirm(tx, order, input, actor, assign);
      case 'PREPARING':
        this.checkPayments(order, input, actor);
        return this.stateMachine.transition(tx, order, 'PREPARING', actor, { comment: input.comment, data: assign });
      case 'READY': {
        const from = order.status;
        await this.stateMachine.transition(tx, order, 'READY', actor, { comment: input.comment, data: assign });
        if (from === 'OUT_FOR_DELIVERY') {
          await this.inventory.unship(tx, orderId, actor.id, input.comment ?? 'Yetkazilmadi');
          await tx.delivery.updateMany({ where: { orderId }, data: { status: 'FAILED', failReason: input.comment ?? null } });
        }
        return;
      }
      case 'OUT_FOR_DELIVERY':
        await this.stateMachine.transition(tx, order, 'OUT_FOR_DELIVERY', actor, { comment: input.comment, data: assign });
        await tx.delivery.updateMany({ where: { orderId }, data: { status: 'IN_TRANSIT', failReason: null } });
        return this.inventory.ship(tx, orderId, actor.id);
      case 'DELIVERED':
        return this.deliver(tx, order, input, actor, assign);
      case 'CANCELLED':
        return this.cancel(tx, order, input.comment ?? null, actor);
      case 'COMPLETED':
        throw new AppException('TRANSITION_FORBIDDEN_ROLE', 'Buyurtma to\'lov yopilganda avtomatik yakunlanadi', HttpStatus.FORBIDDEN);
    }
  }

  /** Mijoz bekor qilishi ham shu yerdan o'tadi — yon ta'sirlar bir joyda */
  async cancel(tx: Tx, order: LockedOrder, reason: string | null, actor: AuthUser) {
    if (order.status === 'PREPARING' && order._count.cuttingLists > 0 && actor.role !== 'SUPER_ADMIN') {
      throw new AppException('CUTTING_STARTED', 'Raspil boshlangan buyurtmani faqat super admin bekor qiladi', HttpStatus.FORBIDDEN);
    }
    await this.stateMachine.transition(tx, order, 'CANCELLED', actor, { comment: reason });
    await this.inventory.release(tx, order.id, actor.id, 'Buyurtma bekor qilindi');
    // To'langan pul ledger'da mijoz foydasiga qoladi (balans manfiy — haqdor). Qaytarish to'lovlar bo'limida
  }

  /** NEW → CONFIRMED: menejer o'zgarishsiz tasdiqlaydi, faqat shartlarni belgilaydi */
  private async confirm(tx: Tx, order: LockedOrder, input: TransitionInput, actor: AuthUser, assign: object) {
    if (!input.terms) {
      throw new AppException('TERMS_REQUIRED', 'To\'lov shartlarini belgilang', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const totals = computeOrderTotals({
      lines: order.items.map((i) => ({ qty: i.qty.toString(), unitPrice: Number(i.unitPrice) })),
      servicesTotal: Number(order.servicesTotal),
      deliveryFee: input.terms.deliveryFee,
      discountTotal: input.terms.discountTotal,
    });
    validateTerms(input.terms, totals, order.customer.customerProfile);
    await this.stateMachine.transition(tx, order, 'CONFIRMED', actor, {
      comment: input.comment,
      data: { ...termsData(input.terms, totals), ...assign },
    });
    await this.inventory.reserve(tx, order.id, actor.id);
  }

  /** CONFIRMED → PREPARING: avans to'langanmi, nasiya limitdan oshmaydimi */
  private checkPayments(order: LockedOrder, input: TransitionInput, actor: AuthUser) {
    if (order.status !== 'CONFIRMED') return; // noto'g'ri o'tishni state machine o'zi rad etadi

    const required =
      order.paymentTerms === 'PREPAID' ? order.grandTotal : order.paymentTerms === 'ADVANCE' ? order.advanceAmount : 0n;
    if (order.paidTotal < required) {
      const canOverride = input.overrideAdvance && actor.role === 'SUPER_ADMIN' && !!input.comment?.trim();
      if (!canOverride) {
        throw new AppException('ADVANCE_NOT_PAID', 'Avans hali to\'lanmagan', HttpStatus.CONFLICT, {
          required,
          paid: order.paidTotal,
        });
      }
    }

    if (order.paymentTerms === 'CREDIT') {
      const profile = order.customer.customerProfile!;
      const exposure = profile.balanceCached + order.grandTotal;
      if (exposure > profile.creditLimit && !(input.overrideCreditLimit && input.comment?.trim())) {
        throw new AppException('CREDIT_LIMIT_EXCEEDED', 'Mijoz kredit limitidan oshadi. Izoh bilan tasdiqlang', HttpStatus.CONFLICT, {
          creditLimit: profile.creditLimit,
          balance: profile.balanceCached,
          exposure,
        });
      }
    }
  }

  private async deliver(tx: Tx, order: LockedOrder, input: TransitionInput, actor: AuthUser, assign: object) {
    // READY → DELIVERED faqat olib ketishda; yetkazishda bu o'tishni state machine rad etadi
    const pickup = order.status === 'READY' && order.deliveryType === 'PICKUP';
    if (pickup && !input.receiverName) {
      throw new AppException('RECEIVER_REQUIRED', 'Tovarni kim olib ketganini kiriting', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    const comment = [input.receiverName ? `Qabul qildi: ${input.receiverName}` : null, input.comment].filter(Boolean).join('. ') || null;
    const termDays = order.customer.customerProfile?.paymentTermDays ?? 0;
    const dueDate =
      order.paymentTerms === 'CREDIT' ? new Date(`${addDays(businessDate(), termDays)}T00:00:00Z`) : undefined;

    await this.stateMachine.transition(tx, order, 'DELIVERED', actor, {
      comment,
      data: { ...assign, ...(dueDate && { dueDate }) },
    });
    if (pickup) await this.inventory.ship(tx, order.id, actor.id);
    else {
      await tx.delivery.updateMany({
        where: { orderId: order.id },
        data: { status: 'DELIVERED', deliveredAt: new Date(), receiverName: input.receiverName ?? null, failReason: null },
      });
    }

    // Tovar topshirildi — mijoz qarzi paydo bo'ladi (avans oldinroq CREDIT bo'lib tushgan)
    await this.ledger.post(tx, {
      customerId: order.customerId,
      type: 'DEBIT',
      amount: order.grandTotal,
      orderId: order.id,
      description: `Buyurtma ${order.number} topshirildi`,
      createdBy: actor.id,
    });
    await this.completeIfSettled(tx, order.id);
  }

  /**
   * DELIVERED → COMPLETED (tizim): to'liq to'langan yoki nasiyaga o'tgan bo'lsa.
   * To'lov tasdiqlanganda ham chaqiriladi.
   */
  async completeIfSettled(tx: Tx, orderId: string) {
    const o = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, status: true, version: true, deliveryType: true, paidTotal: true, grandTotal: true, paymentTerms: true },
    });
    if (o.status !== 'DELIVERED') return;
    const settled = o.paidTotal >= o.grandTotal || o.paymentTerms === 'CREDIT';
    if (!settled) return;
    await this.stateMachine.transition(tx, o, 'COMPLETED', null, {
      comment: o.paymentTerms === 'CREDIT' && o.paidTotal < o.grandTotal ? 'Nasiyaga o\'tdi' : 'To\'liq to\'landi',
    });
  }
}
