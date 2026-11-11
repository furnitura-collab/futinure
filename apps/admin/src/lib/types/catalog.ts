// ───────────── Katalog ─────────────
import type { StockLevel, Unit } from '@mebel/shared';

export interface Category {
  id: string;
  parentId: string | null;
  nameUz: string;
  nameRu: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { products: number; children: number };
}

export interface Brand {
  id: string;
  name: string;
  logoUrl: string | null;
  _count: { products: number };
}

export interface PriceGroup {
  id: string;
  name: string;
  description: string | null;
  _count: { customers: number; prices: number };
}

export interface AdminVariant {
  id: string;
  sku: string;
  attributes: Record<string, string | number>;
  swatchUrl: string | null;
  basePrice: number;
  stockQty: string;
  reservedQty: string;
  availableQty: string;
  lowStockThreshold: string;
  availability: 'IN_STOCK' | 'ON_ORDER' | 'OUT_OF_STOCK';
  onOrder: boolean;
  leadTimeDays: number | null;
  isActive: boolean;
  stockLevel: StockLevel;
  priceTiers: { minQty: string; price: number }[];
  groupPrices: { priceGroupId: string; price: number; priceGroup: { name: string } }[];
}

export interface AdminProduct {
  id: string;
  code: string | null;
  categoryId: string;
  brandId: string | null;
  nameUz: string;
  nameRu: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  unit: Unit;
  kind: 'GOODS' | 'BOARD' | 'EDGE';
  minQty: string;
  qtyStep: string;
  weightKg: string | null;
  volumeM3: string | null;
  boardLengthMm: number | null;
  boardWidthMm: number | null;
  thicknessMm: string | null;
  isActive: boolean;
  updatedAt: string;
  category: { id: string; nameUz: string };
  brand: { id: string; name: string } | null;
  images: { id: string; url: string; sortOrder: number }[];
  variants: AdminVariant[];
}

export interface StockMovement {
  id: string;
  type: 'IN' | 'OUT' | 'ADJUST' | 'RESERVE' | 'RELEASE';
  qty: string;
  reason: string | null;
  createdAt: string;
  order: { id: string; number: string } | null;
}

export interface LowStockRow {
  variant_id: string;
  sku: string;
  product_id: string;
  name_uz: string;
  unit: Unit;
  stock_qty: string;
  reserved_qty: string;
  available_qty: string;
  low_stock_threshold: string;
  on_order: boolean;
}

export interface ImportIssue {
  row: number;
  column?: string;
  message: string;
}

export interface ImportResult {
  committed: boolean;
  rows: number;
  summary: {
    productsCreated: number;
    productsUpdated: number;
    variantsCreated: number;
    variantsUpdated: number;
    priceChanges: number;
    stockChanges: number;
    brandsCreated: string[];
  };
  errors: ImportIssue[];
  warnings: ImportIssue[];
}
