import { HttpStatus, Injectable } from '@nestjs/common';
import {
  businessDate,
  type AdminCustomerListQuery,
  type AdminCustomerUpdate,
  type LedgerAdjustInput,
  type Paginated,
  type RefundInput,
} from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { TokenService } from '../auth/token.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CustomerFinanceService } from './customer-finance.service.js';

/** Faqat super admin o'zgartira oladigan maydonlar */
const SUPER_ADMIN_FIELDS = ['creditLimit', 'paymentTermDays'] as const;

@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: CustomerFinanceService,
    private readonly ledger: LedgerService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async list(q: AdminCustomerListQuery): Promise<Paginated<unknown>> {
    const and: Prisma.UserWhereInput[] = [{ role: 'CUSTOMER' }];
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      and.push({
        OR: [
          { fullName: { contains: q.q, mode: 'insensitive' } },
          { customerProfile: { companyName: { contains: q.q, mode: 'insensitive' } } },
          { customerProfile: { inn: { contains: q.q } } },
          ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
        ],
      });
    }
    if (q.priceGroupId) and.push({ customerProfile: { priceGroupId: q.priceGroupId } });
    if (q.debtors) and.push({ customerProfile: { balanceCached: { gt: 0 } } });
    if (q.overdue) {
      const rows = await this.prisma.$queryRaw<{ customer_id: string }[]>`
        SELECT DISTINCT customer_id FROM orders
        WHERE payment_terms = 'CREDIT' AND status IN ('DELIVERED', 'COMPLETED')
          AND grand_total > paid_total AND due_date < ${businessDate()}::date`;
      and.push({ id: { in: rows.map((r) => r.customer_id) } });
    }

    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        // Qarzdorlar ro'yxatida eng katta qarz birinchi
        orderBy: q.debtors ? { customerProfile: { balanceCached: 'desc' } } : { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          phone: true,
          fullName: true,
          isActive: true,
          createdAt: true,
          lastLoginAt: true,
          customerProfile: { include: { priceGroup: { select: { id: true, name: true } } } },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows, total, page: q.page, limit: q.limit };
  }

  async detail(customerId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: customerId, role: 'CUSTOMER' },
      select: {
        id: true,
        phone: true,
        fullName: true,
        isActive: true,
        locale: true,
        createdAt: true,
        lastLoginAt: true,
        customerProfile: { include: { priceGroup: { select: { id: true, name: true } } } },
        addresses: true,
      },
    });
    if (!user) throw AppException.notFound('Mijoz');
    const [finance, stats, recentOrders] = await Promise.all([
      this.finance.balance(customerId),
      this.prisma.order.aggregate({
        where: { customerId, status: { not: 'CANCELLED' } },
        _count: true,
        _sum: { grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, number: true, status: true, grandTotal: true, paidTotal: true, createdAt: true, dueDate: true },
      }),
    ]);
    return {
      ...user,
      finance,
      stats: { orders: stats._count, turnover: stats._sum.grandTotal ?? 0n },
      recentOrders,
    };
  }

  async update(customerId: string, input: AdminCustomerUpdate, actor: AuthUser) {
    if (actor.role !== 'SUPER_ADMIN') {
      const forbidden = SUPER_ADMIN_FIELDS.filter((f) => input[f] !== undefined);
      if (forbidden.length) throw AppException.forbidden(`Faqat super admin: ${forbidden.join(', ')}`);
    }
    const before = await this.prisma.user.findFirst({
      where: { id: customerId, role: 'CUSTOMER' },
      include: { customerProfile: true },
    });
    if (!before) throw AppException.notFound('Mijoz');
    if (input.priceGroupId) {
      if (!(await this.prisma.priceGroup.count({ where: { id: input.priceGroupId } }))) throw AppException.notFound('Narx guruhi');
    }

    const { fullName, isActive, creditLimit, ...profile } = input;
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: customerId },
        data: {
          fullName,
          isActive,
          customerProfile: {
            update: { ...profile, ...(creditLimit !== undefined && { creditLimit: BigInt(creditLimit) }) },
          },
        },
      });
      await this.audit.log({ actorId: actor.id, entity: 'customer', entityId: customerId, action: 'update', before, after: input }, tx);
    });
    // Bloklangan mijoz darhol chiqariladi (access token 15 daqiqada tugaydi)
    if (isActive === false) await this.tokens.revokeAllForUser(customerId);
    return this.detail(customerId);
  }

  /** Qo'lda tuzatish (masalan, eski qarzni tizimga kiritish). Faqat super admin */
  async adjust(customerId: string, input: LedgerAdjustInput, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.ledger.post(tx, {
        customerId,
        type: 'ADJUSTMENT',
        amount: BigInt(input.amount),
        description: input.description,
        createdBy: actor.id,
      });
      await this.audit.log({ actorId: actor.id, entity: 'customer', entityId: customerId, action: 'ledger_adjust', after: input }, tx);
      return entry;
    });
  }

  /** Mijoz haqdor bo'lsa (masalan, bekor qilingan buyurtma avansi) pulni qaytarish */
  async refund(customerId: string, input: RefundInput, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const [p] = await tx.$queryRaw<{ balance_cached: bigint }[]>`
        SELECT balance_cached FROM customer_profiles WHERE user_id = ${customerId}::uuid FOR UPDATE`;
      if (!p) throw AppException.notFound('Mijoz');
      const credit = -p.balance_cached;
      if (BigInt(input.amount) > credit) {
        throw new AppException('REFUND_EXCEEDS_CREDIT', 'Qaytariladigan summa mijoz haqidan katta', HttpStatus.UNPROCESSABLE_ENTITY, {
          available: credit > 0n ? credit : 0n,
        });
      }
      const entry = await this.ledger.post(tx, {
        customerId,
        type: 'REFUND',
        amount: BigInt(input.amount),
        description: `Pul qaytarildi (${input.method}): ${input.description}`,
        createdBy: actor.id,
      });
      await this.audit.log({ actorId: actor.id, entity: 'customer', entityId: customerId, action: 'refund', after: input }, tx);
      return entry;
    });
  }

  /** Debitorlik hisoboti: kim qancha qarz, qanchasi muddati o'tgan */
  async receivables() {
    const today = businessDate();
    const rows = await this.prisma.$queryRaw<
      { customer_id: string; full_name: string | null; phone: string; company_name: string | null; balance: bigint; credit_limit: bigint; overdue: bigint | null; oldest_due: Date | null }[]
    >`
      SELECT u.id AS customer_id, u.full_name, u.phone, cp.company_name, cp.balance_cached AS balance, cp.credit_limit,
             od.overdue, od.oldest_due
      FROM customer_profiles cp
      JOIN users u ON u.id = cp.user_id
      LEFT JOIN LATERAL (
        SELECT SUM(o.grand_total - o.paid_total)::bigint AS overdue, MIN(o.due_date) AS oldest_due
        FROM orders o
        WHERE o.customer_id = cp.user_id AND o.payment_terms = 'CREDIT' AND o.status IN ('DELIVERED', 'COMPLETED')
          AND o.grand_total > o.paid_total AND o.due_date < ${today}::date
      ) od ON true
      WHERE cp.balance_cached > 0
      ORDER BY od.overdue DESC NULLS LAST, cp.balance_cached DESC
      LIMIT 500`;
    const items = rows.map((r) => ({ ...r, overdue: r.overdue ?? 0n }));
    return {
      totalReceivable: items.reduce((s, r) => s + r.balance, 0n),
      totalOverdue: items.reduce((s, r) => s + r.overdue, 0n),
      customers: items,
    };
  }
}

