import { Global, Injectable, Module } from '@nestjs/common';
import type { LedgerType } from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import type { Tx } from '../audit/audit.service.js';

export interface LedgerPost {
  customerId: string;
  type: LedgerType;
  /** Ishorali: musbat — qarz oshadi, manfiy — kamayadi */
  amount: bigint;
  description: string;
  orderId?: string | null;
  paymentId?: string | null;
  createdBy?: string | null;
}

/**
 * Mijoz hisob daftari. Faqat qo'shiladi, o'zgartirilmaydi — xato teskari yozuv bilan tuzatiladi.
 * balance_cached shu yerda, yozuv bilan bir tranzaksiyada yangilanadi.
 */
@Injectable()
export class LedgerService {
  async post(tx: Tx, entry: LedgerPost) {
    if (entry.amount === 0n) return null;
    // Bir mijozga parallel yozuvlar balansni buzmasin
    const rows = await tx.$queryRaw<{ balance_cached: bigint }[]>`
      SELECT balance_cached FROM customer_profiles WHERE user_id = ${entry.customerId}::uuid FOR UPDATE`;
    const profile = rows[0];
    if (!profile) throw AppException.notFound('Mijoz profili');

    const balanceAfter = profile.balance_cached + entry.amount;
    await tx.customerProfile.update({
      where: { userId: entry.customerId },
      data: { balanceCached: balanceAfter },
    });
    return tx.ledgerEntry.create({
      data: {
        customerId: entry.customerId,
        type: entry.type,
        amount: entry.amount,
        description: entry.description,
        orderId: entry.orderId ?? null,
        paymentId: entry.paymentId ?? null,
        createdBy: entry.createdBy ?? null,
        balanceAfter,
      },
    });
  }
}

@Global()
@Module({ providers: [LedgerService], exports: [LedgerService] })
export class LedgerModule {}
