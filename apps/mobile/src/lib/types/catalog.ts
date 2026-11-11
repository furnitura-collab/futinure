/** Katalog va savat turlari */
import type { StockLevel, Unit } from '@mebel/shared';

export interface CategoryNode {
  id: string;
  parentId: string | null;
  nameUz: string;
  nameRu: string;
  slug: string;
  imageUrl: string | null;
  /** Faol mahsulotlar soni (ichki kategoriyalar bilan) */
  productCount: number;
  children: CategoryNode[];
}

export interface ProductCard {
  id: string;
  nameUz: string;
  nameRu: string;
  unit: Unit;
  kind: string;
  categoryId: string;
  brand: { id: string; name: string } | null;
  imageUrl: string | null;
  priceFrom: number;
  basePriceFrom: number;
  stockLevel: StockLevel;
  variantCount: number;
  /** Yagona variant bo'lsa — ro'yxatdan to'g'ridan-to'g'ri qo'shish */
  variantId: string | null;
  minQty: string;
  qtyStep: string;
}

export interface BuyAgainItem {
  variantId: string;
  sku: string;
  attributes: Record<string, string | number>;
  lastQty: string;
  lastOrderedAt: string;
  unitPrice: number;
  stockLevel: StockLevel;
  product: ProductCard;
}

export interface ProductDetail {
  id: string;
  nameUz: string;
  nameRu: string;
  descriptionUz: string | null;
  descriptionRu: string | null;
  unit: Unit;
  kind: string;
  minQty: string;
  qtyStep: string;
  weightKg: string | null;
  board: { lengthMm: number; widthMm: number; thicknessMm: string } | null;
  brand: { id: string; name: string } | null;
  category: { id: string; nameUz: string; nameRu: string; slug: string; parentId: string | null };
  images: { id: string; url: string }[];
  variants: {
    id: string;
    sku: string;
    attributes: Record<string, string | number>;
    swatchUrl: string | null;
    basePrice: number;
    price: number;
    groupPrice: number | null;
    tiers: { minQty: string; price: number }[];
    stockLevel: StockLevel;
    leadTimeDays: number | null;
  }[];
}

export type LineIssue = { code: string; available?: string; minQty?: string; qtyStep?: string };

export interface CartLine {
  variantId: string;
  qty: string;
  sku: string | null;
  productId: string | null;
  nameUz: string | null;
  nameRu: string | null;
  unit: Unit | null;
  categoryId: string | null;
  kind: string | null;
  imageUrl: string | null;
  minQty: string | null;
  qtyStep: string | null;
  attributes: Record<string, string | number> | null;
  unitPrice: number;
  basePrice: number;
  lineTotal: number;
  stockLevel: StockLevel | null;
  issues: LineIssue[];
}

export interface Cart {
  lines: CartLine[];
  count: number;
  itemsTotal: number;
  totalWeightKg: number;
  hasIssues: boolean;
  hasBlockingIssues: boolean;
}
