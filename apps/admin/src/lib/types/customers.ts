// ───────────── Mijozlar ─────────────
import type {
  CustomerType,
  Locale,
  OrderStatus,
  PaymentMethod,
  Role,
} from '@mebel/shared';

export interface CustomerProfile {
  type: CustomerType;
  companyName: string | null;
  inn: string | null;
  priceGroupId: string | null;
  priceGroup: { id: string; name: string } | null;
  creditLimit: number;
  paymentTermDays: number;
  allowedPaymentMethods: PaymentMethod[];
  balanceCached: number;
}

export interface CustomerRow {
  id: string;
  phone: string;
  fullName: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  customerProfile: CustomerProfile | null;
  _count: { orders: number };
}

export interface CustomerFinance {
  balance: number;
  creditLimit: number;
  availableCredit: number;
  paymentTermDays: number;
  overdueAmount: number;
  pendingPayments: number;
  allowedPaymentMethods: PaymentMethod[];
}

export interface CustomerDetail extends Omit<CustomerRow, '_count'> {
  locale: Locale;
  addresses: { id: string; label: string | null; addressText: string }[];
  finance: CustomerFinance;
  stats: { orders: number; turnover: number };
  recentOrders: { id: string; number: string; status: OrderStatus; grandTotal: number; paidTotal: number; createdAt: string; dueDate: string | null }[];
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

export interface Reconciliation {
  customer: { id: string; phone: string; fullName: string | null; customerProfile: { companyName: string | null; inn: string | null } | null };
  period: { from: string; to: string };
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: (LedgerEntry & { order: { number: string } | null })[];
}

export interface Receivables {
  totalReceivable: number;
  totalOverdue: number;
  customers: {
    customer_id: string;
    full_name: string | null;
    phone: string;
    company_name: string | null;
    balance: number;
    credit_limit: number;
    overdue: number;
    oldest_due: string | null;
  }[];
}

export interface StaffMember {
  id: string;
  phone: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
