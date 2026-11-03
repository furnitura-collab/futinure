import { z } from 'zod';
import { DELIVERY_TYPES, ORDER_STATUSES } from '../enums.js';
import { paginationSchema, positiveQtySchema, uuidSchema } from './common.js';

// ───────────── Savat ─────────────

export const CART_MAX_ITEMS = 200;

export const cartItemSchema = z.object({ qty: positiveQtySchema });
export type CartItemInput = z.infer<typeof cartItemSchema>;

/** SKU bo'yicha tez qo'shish: "KR-W980-16 — 12" */
export const cartBulkAddSchema = z.object({
  items: z
    .array(z.object({ sku: z.string().trim().min(1).max(64), qty: positiveQtySchema }))
    .min(1)
    .max(100),
});
export type CartBulkAddInput = z.infer<typeof cartBulkAddSchema>;

/**
 * Buyurtma berishga to'sqinlik qiladigan muammolar.
 * EXCEEDS_AVAILABLE to'sqinlik qilmaydi — menejer taklifda miqdorni tuzatadi.
 */
export const BLOCKING_ISSUES = [
  'NOT_FOUND',
  'INACTIVE',
  'OUT_OF_STOCK',
  'INVALID',
  'ZERO',
  'BELOW_MIN',
  'NOT_MULTIPLE_OF_STEP',
] as const;

export function isBlockingIssue(code: string): boolean {
  return (BLOCKING_ISSUES as readonly string[]).includes(code);
}

// ───────────── Manzillar ─────────────

/** O'zbekiston chegaralari (taxminan) — xaritada adashib bosilgan nuqtani ushlaydi */
export const addressInputSchema = z.object({
  label: z.string().trim().max(60).nullable().default(null),
  addressText: z.string().trim().min(5).max(500),
  lat: z.number().min(37).max(46),
  lng: z.number().min(55).max(74),
  floor: z.number().int().min(-2).max(50).nullable().default(null),
  needsLoaders: z.boolean().default(false),
  comment: z.string().trim().max(500).nullable().default(null),
});
export type AddressInput = z.infer<typeof addressInputSchema>;
export const addressUpdateSchema = addressInputSchema.partial();
export type AddressUpdate = z.infer<typeof addressUpdateSchema>;

// ───────────── Buyurtma ─────────────

export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
export const MAX_DELIVERY_DAYS_AHEAD = 60;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');

export const createOrderSchema = z
  .object({
    deliveryType: z.enum(DELIVERY_TYPES),
    addressId: uuidSchema.optional(),
    warehouseId: uuidSchema.optional(),
    /** Mijoz xohlagan sana. Yakuniy sanani menejer taklifda belgilaydi */
    deliveryDate: isoDate.optional(),
    comment: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.deliveryType === 'DELIVERY' && !v.addressId) {
      ctx.addIssue({ code: 'custom', path: ['addressId'], message: 'ADDRESS_REQUIRED' });
    }
    if (v.deliveryType === 'PICKUP' && !v.warehouseId) {
      ctx.addIssue({ code: 'custom', path: ['warehouseId'], message: 'WAREHOUSE_REQUIRED' });
    }
  });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const orderListQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  /** true — faqat faol (yakunlanmagan) buyurtmalar */
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
