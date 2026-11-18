/** Balans, hisob-kitob va to'lov rekvizitlari */
import type { PaymentMethod } from '@mebel/shared';

/** balance > 0 — mijoz qarzdor */
export interface Balance {
  balance: number;
  pendingPayments: number;
  allowedPaymentMethods: PaymentMethod[];
}

export interface LedgerEntry {
  id: string;
  type: 'DEBIT' | 'CREDIT' | 'ADJUSTMENT' | 'REFUND';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
  order: { id: string; number: string } | null;
}

export interface PaymentInfo {
  card: { number: string; holder: string } | null;
  bank: { name: string; account: string; mfo: string; inn: string } | null;
}
