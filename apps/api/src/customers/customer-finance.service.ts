import { Injectable } from '@nestjs/common';
import { businessDate, type LedgerQuery, type PeriodQuery } from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { dayRange, dayStart, nextDayStart } from '../common/business-day.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UNPAID_CREDIT_ORDER } from './credit-orders.js';
import { pageArgs, paginate } from '../common/pagination.js';

/** Mijoz moliyasi: balans, daftar, akt-sverka, muddati o'tgan qarz */
@Injectable()
export class CustomerFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async balance(customerId: string) {
    const profile = await this.prisma.customerProfile.findUnique({ where: { userId: customerId } });
    if (!profile) throw AppException.notFound('Mijoz');
    const [overdue, pending] = await Promise.all([
      this.overdueAmount(customerId),
      this.prisma.payment.aggregate({ where: { customerId, status: 'PENDING' }, _sum: { amount: true } }),
    ]);
    const balance = profile.balanceCached;
    return {
      /** Musbat — mijoz qarzdor, manfiy — haqdor */
      balance,
      creditLimit: profile.creditLimit,
      availableCredit: profile.creditLimit > balance ? profile.creditLimit - balance : 0n,
      paymentTermDays: profile.paymentTermDays,
      overdueAmount: overdue,
      pendingPayments: pending._sum.amount ?? 0n,
      allowedPaymentMethods: profile.allowedPaymentMethods,
    };
  }

  /** Nasiya muddati o'tgan, to'lanmagan qism (buyurtmalar bo'yicha) */
  async overdueAmount(customerId: string): Promise<bigint> {
    const [row] = await this.prisma.$queryRaw<[{ sum: bigint | null }]>`
      SELECT SUM(grand_total - paid_total)::bigint AS sum FROM orders
      WHERE customer_id = ${customerId}::uuid AND ${UNPAID_CREDIT_ORDER} AND due_date < ${businessDate()}::date`;
    return row.sum ?? 0n;
  }

  async ledger(customerId: string, q: LedgerQuery) {
    const where: Prisma.LedgerEntryWhereInput = { customerId, createdAt: dayRange(q.from, q.to) };
    return paginate(
      q,
      this.prisma.ledgerEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs(q),
        include: { order: { select: { id: true, number: true } }, payment: { select: { id: true, method: true } } },
      }),
      this.prisma.ledgerEntry.count({ where }),
    );
  }

  /**
   * Akt-sverka: davr boshidagi qoldiq, yozuvlar, aylanmalar, davr oxiridagi qoldiq.
   * Davr berilmasa — joriy oyning boshidan bugungacha.
   */
  async reconciliation(customerId: string, q: PeriodQuery) {
    const today = businessDate();
    const from = q.from ?? `${today.slice(0, 8)}01`;
    const to = q.to ?? today;
    if (from > to) throw new AppException('INVALID_PERIOD', 'Davr boshi oxiridan keyin', 422);

    const customer = await this.prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, phone: true, fullName: true, customerProfile: { select: { companyName: true, inn: true } } },
    });
    if (!customer) throw AppException.notFound('Mijoz');

    const [before, entries] = await Promise.all([
      this.prisma.ledgerEntry.findFirst({
        where: { customerId, createdAt: { lt: dayStart(from) } },
        orderBy: { createdAt: 'desc' },
        select: { balanceAfter: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { customerId, createdAt: { gte: dayStart(from), lt: nextDayStart(to) } },
        orderBy: { createdAt: 'asc' },
        include: { order: { select: { number: true } } },
      }),
    ]);
    const opening = before?.balanceAfter ?? 0n;
    const debit = entries.filter((e) => e.amount > 0n).reduce((s, e) => s + e.amount, 0n);
    const credit = entries.filter((e) => e.amount < 0n).reduce((s, e) => s - e.amount, 0n);
    return {
      customer,
      period: { from, to },
      openingBalance: opening,
      totalDebit: debit,
      totalCredit: credit,
      closingBalance: opening + debit - credit,
      entries,
    };
  }
}
