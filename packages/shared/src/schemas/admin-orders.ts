import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_TERMS } from '../enums.js';
import { moneySchema, paginationSchema, uuidSchema } from './common.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');

/**
 * To'lov va yetkazish shartlari — menejer buyurtmani qabul qilganda (yoki oldindan saqlaganda).
 * PREPAID — to'liq oldindan, ADVANCE — avans, ON_DELIVERY — topshirishda, CREDIT — nasiya.
 */
const termsShape = {
  paymentTerms: z.enum(PAYMENT_TERMS),
  advanceAmount: moneySchema.default(0),
  allowedMethods: z
    .array(z.enum(PAYMENT_METHODS))
    .min(1)
    .max(PAYMENT_METHODS.length)
    .refine((m) => new Set(m).size === m.length, 'DUPLICATE_METHOD'),
  deliveryFee: moneySchema.default(0),
  discountTotal: moneySchema.default(0),
  deliveryDate: isoDate.nullable().optional(),
  vehicleType: z.string().trim().max(20).nullable().optional(),
};

const termsRule = (v: { paymentTerms: string; advanceAmount: number }, ctx: z.RefinementCtx) => {
  if (v.paymentTerms === 'ADVANCE' && v.advanceAmount <= 0) {
    ctx.addIssue({ code: 'custom', path: ['advanceAmount'], message: 'ADVANCE_AMOUNT_REQUIRED' });
  }
  if (v.paymentTerms !== 'ADVANCE' && v.advanceAmount > 0) {
    ctx.addIssue({ code: 'custom', path: ['advanceAmount'], message: 'ADVANCE_ONLY_FOR_ADVANCE_TERMS' });
  }
};

export const orderTermsSchema = z.object(termsShape).superRefine(termsRule);
export type OrderTermsInput = z.infer<typeof orderTermsSchema>;

/** Yangi buyurtmaga shartlarni saqlash (status o'zgarmaydi) — oldindan to'lovda mijoz avansni shunda ko'radi */
export const setTermsSchema = z.object({ terms: orderTermsSchema, expectedVersion: z.number().int().optional() });
export type SetTermsInput = z.infer<typeof setTermsSchema>;

export const transitionSchema = z.object({
  to: z.enum(ORDER_STATUSES),
  comment: z.string().trim().max(1000).optional(),
  /** Mijoz/menejer ko'rgan versiya. Boshqa birov orada o'zgartirgan bo'lsa — 409 */
  expectedVersion: z.number().int().optional(),
  /** NEW → PREPARING: shartlar hali saqlanmagan bo'lsa majburiy */
  terms: orderTermsSchema.optional(),
  /** Kredit limitidan oshsa ham davom etish (izoh majburiy) */
  overrideCreditLimit: z.boolean().default(false),
  /** Avans to'lanmagan bo'lsa ham ishlab chiqarishga berish (faqat super admin, izoh majburiy) */
  overrideAdvance: z.boolean().default(false),
  /** Olib ketishda tovarni kim qabul qildi */
  receiverName: z.string().trim().min(2).max(120).optional(),
});
export type TransitionInput = z.infer<typeof transitionSchema>;

export const assignOrderSchema = z.object({ managerId: uuidSchema.nullable() });
export type AssignOrderInput = z.infer<typeof assignOrderSchema>;

export const adminOrderListQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  managerId: z.union([uuidSchema, z.literal('none')]).optional(),
  customerId: uuidSchema.optional(),
  /** Buyurtma raqami, mijoz telefoni yoki ismi */
  q: z.string().trim().min(2).max(100).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;
