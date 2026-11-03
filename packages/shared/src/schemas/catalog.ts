import { z } from 'zod';
import { PRODUCT_KINDS, UNITS } from '../enums.js';
import { boolQuery, moneySchema, paginationSchema, positiveQtySchema, qtySchema, uuidSchema } from './common.js';

// ───────────── Mijoz ─────────────

export const PRODUCT_SORTS = ['popular', 'price_asc', 'price_desc', 'name', 'new'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const productListQuerySchema = paginationSchema.extend({
  categoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  inStock: boolQuery.optional(),
  sort: z.enum(PRODUCT_SORTS).default('popular'),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const pricingQuoteSchema = z.object({
  items: z
    .array(z.object({ variantId: uuidSchema, qty: positiveQtySchema }))
    .min(1)
    .max(200),
});
export type PricingQuoteInput = z.infer<typeof pricingQuoteSchema>;

// ───────────── Admin: katalog ─────────────

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'INVALID_SLUG')
  .max(80);
const name = z.string().trim().min(1).max(200);
const optionalText = z.string().trim().max(5000).nullable().optional();

export const categoryInputSchema = z.object({
  parentId: uuidSchema.nullable().default(null),
  nameUz: name,
  nameRu: name,
  slug,
  imageUrl: z.string().max(500).nullable().default(null),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export const categoryUpdateSchema = categoryInputSchema.partial();
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export const brandInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  logoUrl: z.string().max(500).nullable().default(null),
});
export type BrandInput = z.infer<typeof brandInputSchema>;

const productBase = z.object({
  categoryId: uuidSchema,
  brandId: uuidSchema.nullable().default(null),
  code: z.string().trim().min(1).max(64).nullable().default(null),
  nameUz: name,
  nameRu: name,
  descriptionUz: optionalText,
  descriptionRu: optionalText,
  unit: z.enum(UNITS),
  kind: z.enum(PRODUCT_KINDS).default('GOODS'),
  minQty: positiveQtySchema.default('1'),
  qtyStep: positiveQtySchema.default('1'),
  weightKg: qtySchema.nullable().default(null),
  volumeM3: z.number().min(0).max(100).nullable().default(null),
  boardLengthMm: z.number().int().positive().max(10_000).nullable().default(null),
  boardWidthMm: z.number().int().positive().max(10_000).nullable().default(null),
  thicknessMm: z.number().positive().max(200).nullable().default(null),
  isActive: z.boolean().default(true),
});

const boardRule = (p: { kind?: string; boardLengthMm?: number | null; boardWidthMm?: number | null }) =>
  p.kind !== 'BOARD' || (p.boardLengthMm != null && p.boardWidthMm != null);

export const productInputSchema = productBase.refine(boardRule, {
  message: 'BOARD_DIMENSIONS_REQUIRED',
  path: ['boardLengthMm'],
});
export type ProductInput = z.infer<typeof productInputSchema>;
export const productUpdateSchema = productBase.partial();
export type ProductUpdate = z.infer<typeof productUpdateSchema>;

export const adminProductListQuerySchema = paginationSchema.extend({
  categoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
  q: z.string().trim().min(1).max(100).optional(),
  isActive: boolQuery.optional(),
  lowStock: boolQuery.optional(),
});
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;

const attributes = z.record(z.string().min(1).max(40), z.union([z.string().max(100), z.number()]));

export const variantInputSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._\-/]+$/, 'INVALID_SKU'),
  attributes: attributes.default({}),
  swatchUrl: z.string().max(500).nullable().default(null),
  basePrice: moneySchema,
  lowStockThreshold: qtySchema.default('0'),
  onOrder: z.boolean().default(false),
  leadTimeDays: z.number().int().min(0).max(365).nullable().default(null),
  isActive: z.boolean().default(true),
});
export type VariantInput = z.infer<typeof variantInputSchema>;
export const variantUpdateSchema = variantInputSchema.partial();
export type VariantUpdate = z.infer<typeof variantUpdateSchema>;

export const priceTiersSchema = z
  .array(z.object({ minQty: positiveQtySchema, price: moneySchema }))
  .max(10)
  .refine((tiers) => new Set(tiers.map((t) => t.minQty)).size === tiers.length, 'DUPLICATE_MIN_QTY');
export type PriceTiersInput = z.infer<typeof priceTiersSchema>;

export const groupPricesSchema = z
  .array(z.object({ priceGroupId: uuidSchema, price: moneySchema }))
  .max(20)
  .refine((g) => new Set(g.map((x) => x.priceGroupId)).size === g.length, 'DUPLICATE_GROUP');
export type GroupPricesInput = z.infer<typeof groupPricesSchema>;

export const imageInputSchema = z.object({
  url: z.string().min(1).max(500),
  sortOrder: z.number().int().default(0),
});
export type ImageInput = z.infer<typeof imageInputSchema>;

export const priceGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).nullable().default(null),
});
export type PriceGroupInput = z.infer<typeof priceGroupInputSchema>;

// ───────────── Admin: narx va ombor ─────────────

export const ROUND_TO = [1, 100, 500, 1000] as const;

export const bulkPriceSchema = z.object({
  categoryId: uuidSchema.optional(),
  brandId: uuidSchema.optional(),
  percent: z
    .number()
    .min(-50)
    .max(200)
    .refine((p) => p !== 0, 'PERCENT_ZERO'),
  roundTo: z.union(ROUND_TO.map((v) => z.literal(v))).default(100),
  includeTiers: z.boolean().default(true),
  includeGroupPrices: z.boolean().default(true),
  /** true — faqat ko'rsatadi, saqlamaydi */
  dryRun: z.boolean().default(true),
});
export type BulkPriceInput = z.infer<typeof bulkPriceSchema>;

export const stockMovementInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('IN'),
    variantId: uuidSchema,
    qty: positiveQtySchema,
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({
    type: z.literal('ADJUST'),
    variantId: uuidSchema,
    /** Inventarizatsiyada sanalgan haqiqiy qoldiq */
    actualQty: qtySchema,
    reason: z.string().trim().min(3).max(300),
  }),
]);
export type StockMovementInput = z.infer<typeof stockMovementInputSchema>;

export const importCommitQuerySchema = z.object({
  commit: boolQuery.default(false),
});
