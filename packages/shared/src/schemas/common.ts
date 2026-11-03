import { z } from 'zod';
import { fromMilli, toMilli } from '../quantity.js';

export const uuidSchema = z.uuid();

/** Miqdor: "12.5" yoki 12.5 → normallashgan "12.5". Maks 3 kasr xona. */
export const qtySchema = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const milli = toMilli(v);
  if (milli === null) {
    ctx.addIssue({ code: 'custom', message: 'INVALID_QTY' });
    return z.NEVER;
  }
  return fromMilli(milli);
});

export const positiveQtySchema = qtySchema.refine((v) => toMilli(v)! > 0, 'QTY_MUST_BE_POSITIVE');

/** Pul — butun so'm. 10 trln dan oshmaydi. */
export const moneySchema = z.number().int().min(0).max(10_000_000_000_000);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const boolQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}
