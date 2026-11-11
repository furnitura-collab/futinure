/** Balans, hisob-kitob va to'lov rekvizitlari */
import type { PaymentMethod } from '@mebel/shared';

export interface Balance {
  balance: number;
  creditLimit: number;
  availableCredit: number;
  paymentTermDays: number;
  overdueAmount: number;
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
