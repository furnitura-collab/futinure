import { z } from 'zod';
import { CUSTOMER_TYPES, PAYMENT_METHODS, PAYMENT_STATUSES } from '../enums.js';
import { boolQuery, moneySchema, paginationSchema, uuidSchema } from './common.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');
const positiveMoney = moneySchema.refine((v) => v > 0, 'AMOUNT_MUST_BE_POSITIVE');

/**
 * Mijoz o'zi xabar beradigan usullar: o'tkazma qilib chek yuklaydi.
 * Naqdni menejer kiritadi, Click/Payme — integratsiya orqali (3-bosqich).
 */
export const CUSTOMER_REPORTABLE_METHODS = ['CARD_TRANSFER', 'BANK_TRANSFER'] as const;
export const MAX_PENDING_PAYMENTS = 5;

export const customerPaymentSchema = z.object({
  amount: positiveMoney,
  method: z.enum(CUSTOMER_REPORTABLE_METHODS),
  receiptUploadId: uuidSchema,
  comment: z.string().trim().max(500).optional(),
});
export type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;

/** Menejer qabul qilgan pul — darhol tasdiqlangan bo'ladi */
export const adminPaymentSchema = z.object({
  customerId: uuidSchema,
  orderId: uuidSchema.optional(),
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  comment: z.string().trim().max(500).optional(),
});
export type AdminPaymentInput = z.infer<typeof adminPaymentSchema>;

export const rejectPaymentSchema = z.object({ reason: z.string().trim().min(3).max(500) });
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;

export const paymentListQuerySchema = paginationSchema.extend({
  status: z.enum(PAYMENT_STATUSES).optional(),
  customerId: uuidSchema.optional(),
  orderId: uuidSchema.optional(),
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export const periodQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type PeriodQuery = z.infer<typeof periodQuerySchema>;

export const ledgerQuerySchema = paginationSchema.extend(periodQuerySchema.shape);
export type LedgerQuery = z.infer<typeof ledgerQuerySchema>;

/** Qo'lda tuzatish. Ishorali: musbat — qarz oshadi, manfiy — kamayadi */
export const ledgerAdjustSchema = z.object({
  amount: z
    .number()
    .int()
    .min(-10_000_000_000_000)
    .max(10_000_000_000_000)
    .refine((v) => v !== 0, 'AMOUNT_ZERO'),
  description: z.string().trim().min(5).max(500),
});
export type LedgerAdjustInput = z.infer<typeof ledgerAdjustSchema>;

/** Mijozga pul qaytarish (haqdor bo'lsa) */
export const refundSchema = z.object({
  amount: positiveMoney,
  method: z.enum(PAYMENT_METHODS),
  description: z.string().trim().min(5).max(500),
});
export type RefundInput = z.infer<typeof refundSchema>;

// ───────────── Admin: mijozlar ─────────────

export const adminCustomerListQuerySchema = paginationSchema.extend({
  q: z.string().trim().min(2).max(100).optional(),
  priceGroupId: uuidSchema.optional(),
  /** Faqat qarzdorlar (balans > 0) */
  debtors: boolQuery.optional(),
  /** Faqat muddati o'tgan qarzi borlar */
  overdue: boolQuery.optional(),
});
export type AdminCustomerListQuery = z.infer<typeof adminCustomerListQuerySchema>;

export const adminCustomerUpdateSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    isActive: z.boolean(),
    type: z.enum(CUSTOMER_TYPES),
    companyName: z.string().trim().max(200).nullable(),
    inn: z
      .string()
      .regex(/^\d{9}$/, 'INVALID_INN')
      .nullable(),
    priceGroupId: uuidSchema.nullable(),
    creditLimit: moneySchema,
    paymentTermDays: z.number().int().min(0).max(365),
    allowedPaymentMethods: z
      .array(z.enum(PAYMENT_METHODS))
      .min(1)
      .refine((m) => new Set(m).size === m.length, 'DUPLICATE_METHOD'),
  })
  .partial();
export type AdminCustomerUpdate = z.infer<typeof adminCustomerUpdateSchema>;
