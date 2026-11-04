import { HttpStatus, Injectable } from '@nestjs/common';
import {
  MAX_PENDING_PAYMENTS,
  type AdminPaymentInput,
  type CustomerPaymentInput,
  type OrderStatus,
  type Paginated,
  type PaymentListQuery,
  type PaymentMethod,
} from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService, type Tx } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { OutboxService } from '../events/outbox.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { lockOrder } from '../orders/order-lock.js';
import { OrderWorkflowService } from '../orders/order-workflow.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RECEIPT_PURPOSE } from '../uploads/private-files.service.js';
import { pageArgs, paginate } from '../common/pagination.js';

/** Shu statuslarda buyurtmaga to'lov qabul qilinadi (taklif kelishilgandan keyin) */
const PAYABLE: readonly OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED'];

const METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'naqd',
  CARD_TRANSFER: 'karta o\'tkazmasi',
  CLICK: 'Click',
  PAYME: 'Payme',
  BANK_TRANSFER: 'bank o\'tkazmasi',
};

const paymentInclude = {
  order: { select: { id: true, number: true, grandTotal: true, paidTotal: true } },
  customer: { select: { id: true, phone: true, fullName: true, customerProfile: { select: { companyName: true } } } },
  receipt: { select: { id: true, mimeType: true, size: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly workflow: OrderWorkflowService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ───────────── Mijoz ─────────────

  /** Buyurtma uchun o'tkazma — chek bilan, menejer tasdiqlaguncha PENDING */
  async reportForOrder(customer: AuthUser, orderId: string, input: CustomerPaymentInput) {
    return this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.customerId !== customer.id) throw AppException.notFound('Buyurtma');
      if (!PAYABLE.includes(order.status)) {
        throw new AppException('ORDER_NOT_PAYABLE', 'To\'lov menejer shartlarni tasdiqlagandan keyin qilinadi', HttpStatus.CONFLICT, {
          status: order.status,
        });
      }
      if (order.allowedMethods.length && !order.allowedMethods.includes(input.method)) {
        throw new AppException('METHOD_NOT_ALLOWED', 'Bu buyurtma uchun bunday to\'lov usuli kelishilmagan', HttpStatus.UNPROCESSABLE_ENTITY, {
          allowed: order.allowedMethods,
        });
      }
      const pending = await this.pendingSum(tx, { orderId });
      const due = order.grandTotal - order.paidTotal - pending;
      if (BigInt(input.amount) > due) {
        throw new AppException('AMOUNT_EXCEEDS_DUE', 'Summa qoldiq qarzdan katta', HttpStatus.UNPROCESSABLE_ENTITY, { due: due > 0n ? due : 0n });
      }
      return this.createPending(tx, customer, input, orderId);
    });
  }

  /** Umumiy qarzga to'lov (buyurtmaga bog'lanmagan) */
  async reportForDebt(customer: AuthUser, input: CustomerPaymentInput) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.customerProfile.findUniqueOrThrow({ where: { userId: customer.id } });
      if (!profile.allowedPaymentMethods.includes(input.method)) {
        throw new AppException('METHOD_NOT_ALLOWED', 'Bu to\'lov usuli sizga ochilmagan', HttpStatus.UNPROCESSABLE_ENTITY);
      }
      const pending = await this.pendingSum(tx, { customerId: customer.id, orderId: null });
      const due = profile.balanceCached - pending;
      if (BigInt(input.amount) > due) {
        throw new AppException('AMOUNT_EXCEEDS_DUE', 'Summa qarzdan katta', HttpStatus.UNPROCESSABLE_ENTITY, { due: due > 0n ? due : 0n });
      }
      return this.createPending(tx, customer, input, null);
    });
  }

  private async createPending(tx: Tx, customer: AuthUser, input: CustomerPaymentInput, orderId: string | null) {
    const pendingCount = await tx.payment.count({ where: { customerId: customer.id, status: 'PENDING' } });
    if (pendingCount >= MAX_PENDING_PAYMENTS) {
      throw new AppException('TOO_MANY_PENDING', 'Avvalgi to\'lovlaringiz hali tekshirilmoqda', HttpStatus.TOO_MANY_REQUESTS);
    }
    const receipt = await tx.upload.findFirst({
      where: { id: input.receiptUploadId, ownerId: customer.id, purpose: RECEIPT_PURPOSE },
      select: { id: true, payment: { select: { id: true } } },
    });
    if (!receipt) throw AppException.notFound('Chek');
    if (receipt.payment) throw new AppException('RECEIPT_ALREADY_USED', 'Bu chek boshqa to\'lovga biriktirilgan', HttpStatus.CONFLICT);

    const payment = await tx.payment.create({
      data: {
        customerId: customer.id,
        orderId,
        amount: BigInt(input.amount),
        method: input.method,
        receiptUploadId: receipt.id,
        comment: input.comment ?? null,
        createdBy: customer.id,
      },
      include: paymentInclude,
    });
    await this.outbox.add(tx, 'payment.created', { paymentId: payment.id });
    return payment;
  }

  /**
   * Haydovchi topshirishda olgan naqd pul. Kassaga topshirilganda menejer tasdiqlaydi —
   * shungacha PENDING (pul haydovchida). Chaqiruvchi tranzaksiyasida, buyurtma qulflangan holda.
   */
  async createDriverCash(tx: Tx, order: { id: string; customerId: string; grandTotal: bigint; paidTotal: bigint }, amount: bigint, driver: AuthUser) {
    const pending = await this.pendingSum(tx, { orderId: order.id });
    const due = order.grandTotal - order.paidTotal - pending;
    if (amount > due) {
      throw new AppException('AMOUNT_EXCEEDS_DUE', 'Summa qoldiq qarzdan katta', HttpStatus.UNPROCESSABLE_ENTITY, { due: due > 0n ? due : 0n });
    }
    const payment = await tx.payment.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        amount,
        method: 'CASH',
        comment: 'Haydovchi topshirishda oldi',
        createdBy: driver.id,
      },
    });
    await this.outbox.add(tx, 'payment.created', { paymentId: payment.id });
    return payment;
  }

  async customerPayments(customerId: string, page: number, limit: number) {
    const where = { customerId };
    return paginate(
      { page, limit },
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs({ page, limit }),
        include: { order: { select: { id: true, number: true } } },
      }),
      this.prisma.payment.count({ where }),
    );
  }

  // ───────────── Menejer ─────────────

  async list(q: PaymentListQuery): Promise<Paginated<unknown>> {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status && { status: q.status }),
      ...(q.customerId && { customerId: q.customerId }),
      ...(q.orderId && { orderId: q.orderId }),
    };
    return paginate(
      q,
      this.prisma.payment.findMany({
        where,
        // Tasdiq navbatida eng eskisi birinchi
        orderBy: { createdAt: q.status === 'PENDING' ? 'asc' : 'desc' },
        ...pageArgs(q),
        include: paymentInclude,
      }),
      this.prisma.payment.count({ where }),
    );
  }

  /** Menejer qabul qilgan pul (naqd, bank) — darhol tasdiqlangan */
  async record(input: AdminPaymentInput, actor: AuthUser) {
    const id = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.customerProfile.findUnique({ where: { userId: input.customerId } });
      if (!profile) throw AppException.notFound('Mijoz');
      if (input.orderId) {
        const order = await lockOrder(tx, input.orderId);
        if (order.customerId !== input.customerId) throw new AppException('ORDER_CUSTOMER_MISMATCH', 'Buyurtma boshqa mijozniki', 422);
        if (!PAYABLE.includes(order.status)) {
          throw new AppException('ORDER_NOT_PAYABLE', 'Buyurtma hali tasdiqlanmagan yoki bekor qilingan', HttpStatus.CONFLICT);
        }
      }
      const payment = await tx.payment.create({
        data: {
          customerId: input.customerId,
          orderId: input.orderId ?? null,
          amount: BigInt(input.amount),
          method: input.method,
          comment: input.comment ?? null,
          createdBy: actor.id,
          status: 'CONFIRMED',
          confirmedBy: actor.id,
          confirmedAt: new Date(),
        },
      });
      await this.applyConfirmed(tx, payment, actor);
      return payment.id;
    });
    return this.get(id);
  }

  async confirm(paymentId: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      // Ikki menejer bir vaqtda bossa — faqat bittasi o'tadi
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'CONFIRMED', confirmedBy: actor.id, confirmedAt: new Date() },
      });
      if (!count) throw await this.notPending(tx, paymentId);
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      await this.applyConfirmed(tx, payment, actor);
    });
    return this.get(paymentId);
  }

  async reject(paymentId: string, reason: string, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: paymentId, status: 'PENDING' },
        data: { status: 'REJECTED', rejectReason: reason, confirmedBy: actor.id, confirmedAt: new Date() },
      });
      if (!count) throw await this.notPending(tx, paymentId);
      await this.audit.log({ actorId: actor.id, entity: 'payment', entityId: paymentId, action: 'reject', after: { reason } }, tx);
      await this.outbox.add(tx, 'payment.rejected', { paymentId });
    });
    return this.get(paymentId);
  }

  async get(paymentId: string) {
    const p = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    if (!p) throw AppException.notFound('To\'lov');
    return p;
  }

  /** Chek fayli — egasi yoki menejer */
  async receiptFor(paymentId: string, viewer: AuthUser) {
    const p = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: { customerId: true, receipt: true },
    });
    if (!p || (viewer.role === 'CUSTOMER' && p.customerId !== viewer.id)) throw AppException.notFound('To\'lov');
    if (!p.receipt) throw AppException.notFound('Chek');
    return p.receipt;
  }

  // ───────────── Ichki ─────────────

  /**
   * Tasdiqlangan to'lovning ta'siri (bitta tranzaksiyada):
   * ledger CREDIT, buyurtmaning paid_total, kerak bo'lsa buyurtmani yakunlash.
   * Buyurtmasiz to'lov eng eski to'lanmagan buyurtmalarga taqsimlanadi (FIFO).
   */
  private async applyConfirmed(
    tx: Tx,
    p: { id: string; customerId: string; orderId: string | null; amount: bigint; method: PaymentMethod },
    actor: AuthUser,
  ) {
    const order = p.orderId ? await tx.order.findUnique({ where: { id: p.orderId }, select: { number: true } }) : null;
    await this.ledger.post(tx, {
      customerId: p.customerId,
      type: 'CREDIT',
      amount: -p.amount,
      orderId: p.orderId,
      paymentId: p.id,
      description: `To'lov (${METHOD_LABEL[p.method]})${order ? ` — ${order.number}` : ''}`,
      createdBy: actor.id,
    });

    const allocations: { orderId: string; amount: bigint }[] = [];
    if (p.orderId) {
      await lockOrder(tx, p.orderId);
      allocations.push({ orderId: p.orderId, amount: p.amount });
    } else {
      let left = p.amount;
      const debts = await tx.$queryRaw<{ id: string; due: bigint }[]>`
        SELECT id, grand_total - paid_total AS due FROM orders
        WHERE customer_id = ${p.customerId}::uuid AND status IN ('DELIVERED', 'COMPLETED') AND grand_total > paid_total
        ORDER BY delivered_at ASC, id ASC FOR UPDATE`;
      for (const d of debts) {
        if (left <= 0n) break;
        const amount = d.due < left ? d.due : left;
        allocations.push({ orderId: d.id, amount });
        left -= amount;
      }
      // Ortib qolgani mijoz foydasiga balansda qoladi (ledger'da allaqachon)
    }

    for (const a of allocations) {
      await tx.order.update({ where: { id: a.orderId }, data: { paidTotal: { increment: a.amount } } });
      await this.workflow.completeIfSettled(tx, a.orderId);
    }
    await this.audit.log(
      { actorId: actor.id, entity: 'payment', entityId: p.id, action: 'confirm', after: { amount: p.amount, allocations } },
      tx,
    );
    await this.outbox.add(tx, 'payment.confirmed', { paymentId: p.id });
  }

  private async pendingSum(tx: Tx, where: Prisma.PaymentWhereInput) {
    const agg = await tx.payment.aggregate({ where: { ...where, status: 'PENDING' }, _sum: { amount: true } });
    return agg._sum.amount ?? 0n;
  }

  private async notPending(tx: Tx, paymentId: string) {
    const p = await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true } });
    if (!p) return AppException.notFound('To\'lov');
    return new AppException('PAYMENT_NOT_PENDING', 'To\'lov allaqachon ko\'rib chiqilgan', HttpStatus.CONFLICT, { status: p.status });
  }
}
