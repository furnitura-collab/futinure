import { z } from 'zod';
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_TERMS } from '../enums.js';
import { moneySchema, paginationSchema, positiveQtySchema, qtySchema, uuidSchema } from './common.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');

/**
 * To'lov va yetkazish shartlari — taklifda yoki to'g'ridan-to'g'ri tasdiqlashda.
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

const priceOverride = moneySchema.optional();

export const quoteInputSchema = z
  .object({
    ...termsShape,
    /** Mavjud qatorni o'zgartirish. qty=0 — qatorni olib tashlash */
    itemChanges: z
      .array(z.object({ itemId: uuidSchema, qty: qtySchema, unitPrice: priceOverride }))
      .max(200)
      .default([]),
    /** Yo'q tovar o'rniga analog */
    replacements: z
      .array(z.object({ itemId: uuidSchema, variantId: uuidSchema, qty: positiveQtySchema, unitPrice: priceOverride }))
      .max(200)
      .default([]),
    /** Yangi tovar qo'shish (masalan, plitaga mos kromka) */
    additions: z
      .array(z.object({ variantId: uuidSchema, qty: positiveQtySchema, unitPrice: priceOverride }))
      .max(200)
      .default([]),
    note: z.string().trim().max(1000).optional(),
    expiresInHours: z.number().int().min(1).max(168).optional(),
    expectedVersion: z.number().int().optional(),
  })
  .superRefine(termsRule)
  .superRefine((v, ctx) => {
    const ids = [...v.itemChanges.map((c) => c.itemId), ...v.replacements.map((r) => r.itemId)];
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['itemChanges'], message: 'ITEM_CHANGED_TWICE' });
    }
  });
export type QuoteInput = z.infer<typeof quoteInputSchema>;

export const rejectQuoteSchema = z.object({ comment: z.string().trim().min(3).max(1000) });
export type RejectQuoteInput = z.infer<typeof rejectQuoteSchema>;

export const transitionSchema = z.object({
  to: z.enum(ORDER_STATUSES),
  comment: z.string().trim().max(1000).optional(),
  /** Mijoz/menejer ko'rgan versiya. Boshqa birov orada o'zgartirgan bo'lsa — 409 */
  expectedVersion: z.number().int().optional(),
  /** NEW → CONFIRMED uchun majburiy */
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

export const QUOTE_LINE_ACTIONS = ['KEEP', 'CHANGE', 'REMOVE', 'REPLACE', 'ADD'] as const;
export type QuoteLineAction = (typeof QUOTE_LINE_ACTIONS)[number];

/** Taklif qatori — mijozga "eski → yangi" ko'rinishida ko'rsatiladi */
export interface QuoteLine {
  action: QuoteLineAction;
  /** KEEP/CHANGE/REMOVE — shu qator; REPLACE — almashtirilayotgan qator; ADD — null */
  itemId: string | null;
  variantId: string;
  sku: string;
  nameUz: string;
  nameRu: string;
  unit: string;
  attributes: unknown;
  oldQty: string | null;
  qty: string;
  oldUnitPrice: number | null;
  unitPrice: number;
  lineTotal: number;
  /** REPLACE uchun: eski tovar */
  replaces?: { sku: string; nameUz: string; nameRu: string } | null;
}
