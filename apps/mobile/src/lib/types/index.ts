import type {
  CustomerType,
  Locale,
  PaymentMethod,
  Role,
} from '@mebel/shared';

export type { Paginated } from '@mebel/shared';
export type * from './catalog';
export type * from './orders';
export type * from './finance';
export type * from './driver';

export interface Me {
  id: string;
  phone: string;
  fullName: string | null;
  role: Role;
  locale: Locale;
  customerProfile: {
    type: CustomerType;
    companyName: string | null;
    inn: string | null;
    creditLimit: number;
    paymentTermDays: number;
    allowedPaymentMethods: PaymentMethod[];
    balanceCached: number;
    priceGroup: { id: string; name: string } | null;
  } | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: { orderId?: string; quoteId?: string; paymentId?: string };
  readAt: string | null;
  createdAt: string;
}
