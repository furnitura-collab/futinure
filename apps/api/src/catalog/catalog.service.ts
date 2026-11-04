import { Injectable } from '@nestjs/common';
import { isOrderable, type Paginated, type PricingQuoteInput, type ProductListQuery, type StockLevel } from '@mebel/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildTree, categoryWithDescendants } from './category-tree.js';
import { PricingService, priceOf, variantPricingInclude, variantStockLevel } from './pricing.service.js';

const LEVEL_RANK: Record<StockLevel, number> = { IN_STOCK: 3, LOW: 2, ON_ORDER: 1, OUT_OF_STOCK: 0 };
const FUZZY_THRESHOLD = 0.45;
const FUZZY_MIN_LENGTH = 4;

export interface ProductCard {
  id: string;
  nameUz: string;
  nameRu: string;
  unit: string;
  kind: string;
  categoryId: string;
  brand: { id: string; name: string } | null;
  imageUrl: string | null;
  /** Mijozning shaxsiy narxi (1 birlik uchun eng arzon variant) */
  priceFrom: number;
  basePriceFrom: number;
  stockLevel: StockLevel;
  variantCount: number;
  /** Yagona variant bo'lsa — ro'yxatdan to'g'ridan-to'g'ri savatga qo'shish uchun */
  variantId: string | null;
  minQty: string;
  qtyStep: string;
}

export interface BuyAgainItem {
  variantId: string;
  sku: string;
  attributes: unknown;
  /** Oxirgi buyurtmadagi miqdor — "bir bosishda" qayta qo'shiladi */
  lastQty: string;
  lastOrderedAt: Date;
  unitPrice: number;
  stockLevel: StockLevel;
  product: ProductCard;
}

const BUY_AGAIN_LIMIT = 12;

/** LIKE uchun maxsus belgilarni ekranlash */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async categories() {
    const rows = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { nameUz: 'asc' }],
      select: { id: true, parentId: true, nameUz: true, nameRu: true, slug: true, imageUrl: true },
    });
    // Faol bo'lmagan ota-onaning bolalari ham ko'rinmasin
    const activeIds = new Set(rows.map((r) => r.id));
    const direct = await this.prisma.$queryRaw<{ category_id: string; n: bigint }[]>`
      SELECT p.category_id, COUNT(*) AS n FROM products p
      WHERE p.is_active AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)
      GROUP BY p.category_id`;
    const own = new Map(direct.map((r) => [r.category_id, Number(r.n)]));
    const tree = buildTree(rows.filter((r) => !r.parentId || activeIds.has(r.parentId)).map((r) => ({ ...r, productCount: own.get(r.id) ?? 0 })));
    // Ota kategoriya soni ichidagilarni ham o'z ichiga oladi (katalog filtri ham shunday ishlaydi)
    const total = (n: (typeof tree)[number]): number => (n.productCount += n.children.reduce((s, c) => s + total(c), 0));
    tree.forEach(total);
    return tree;
  }

  brands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, logoUrl: true } });
  }

  async list(query: ProductListQuery, userId: string | null): Promise<Paginated<ProductCard>> {
    const where: Prisma.Sql[] = [
      Prisma.sql`p.is_active = true`,
      Prisma.sql`EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active)`,
      Prisma.sql`EXISTS (SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.is_active)`,
    ];
    if (query.categoryId) {
      const ids = await categoryWithDescendants(this.prisma, query.categoryId);
      where.push(Prisma.sql`p.category_id = ANY(${ids}::uuid[])`);
    }
    if (query.brandId) where.push(Prisma.sql`p.brand_id = ${query.brandId}::uuid`);
    if (query.q) {
      const like = likePattern(query.q);
      // ILIKE — aniq moslik. word_similarity — xatoli yozuv ("kronspan" → "Kronospan").
      // Postgres default chegarasi (0.6) bitta harf xatosini o'tkazmaydi; qisqa so'zda shovqin ko'p
      const fuzzy =
        query.q.length >= FUZZY_MIN_LENGTH
          ? Prisma.sql`OR word_similarity(${query.q}, p.name_uz) >= ${FUZZY_THRESHOLD}
                       OR word_similarity(${query.q}, p.name_ru) >= ${FUZZY_THRESHOLD}`
          : Prisma.empty;
      where.push(Prisma.sql`(
        p.name_uz ILIKE ${like} OR p.name_ru ILIKE ${like} ${fuzzy}
        OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.is_active AND v.sku ILIKE ${like})
      )`);
    }
    if (query.inStock) {
      where.push(Prisma.sql`EXISTS (
        SELECT 1 FROM product_variants v
        WHERE v.product_id = p.id AND v.is_active AND v.stock_qty - v.reserved_qty > 0
      )`);
    }

    const minPrice = Prisma.sql`(SELECT MIN(v.base_price) FROM product_variants v WHERE v.product_id = p.id AND v.is_active)`;
    const sold = Prisma.sql`(
      SELECT COALESCE(COUNT(*), 0) FROM order_items oi
      JOIN product_variants v ON v.id = oi.variant_id
      WHERE v.product_id = p.id AND oi.created_at > now() - interval '90 days'
    )`;
    const orderBy = {
      price_asc: Prisma.sql`${minPrice} ASC, p.name_uz ASC`,
      price_desc: Prisma.sql`${minPrice} DESC, p.name_uz ASC`,
      name: Prisma.sql`p.name_uz ASC`,
      new: Prisma.sql`p.created_at DESC`,
      popular: query.q
        ? Prisma.sql`GREATEST(word_similarity(${query.q}, p.name_uz), word_similarity(${query.q}, p.name_ru)) DESC, ${sold} DESC`
        : Prisma.sql`${sold} DESC, p.name_uz ASC`,
    }[query.sort];

    const whereSql = Prisma.join(where, ' AND ');
    const offset = (query.page - 1) * query.limit;
    const [ids, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM products p WHERE ${whereSql} ORDER BY ${orderBy} LIMIT ${query.limit} OFFSET ${offset}`,
      this.prisma.$queryRaw<[{ total: bigint }]>`SELECT COUNT(*) AS total FROM products p WHERE ${whereSql}`,
    ]);

    const items = await this.cards(
      ids.map((r) => r.id),
      userId,
    );
    return { items, total: Number(total), page: query.page, limit: query.limit };
  }

  /** Mahsulot kartochkalari, berilgan tartibda */
  async cards(productIds: string[], userId: string | null): Promise<ProductCard[]> {
    if (productIds.length === 0) return [];
    const groupId = await this.pricing.priceGroupOf(userId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      include: {
        brand: { select: { id: true, name: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
        variants: { where: { isActive: true }, include: variantPricingInclude(groupId) },
      },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return productIds.flatMap((id) => {
      const p = byId.get(id);
      if (!p || p.variants.length === 0) return [];
      const minQty = p.minQty.toString();
      const levels = p.variants.map(variantStockLevel);
      // "...dan" narxi sotuvda bor variantlardan; hammasi tugagan bo'lsa — barchasidan
      const orderable = p.variants.filter((_, i) => isOrderable(levels[i]!));
      const priced = orderable.length ? orderable : p.variants;
      const prices = priced.map((v) => priceOf(v, minQty).unitPrice);
      return [
        {
          id: p.id,
          nameUz: p.nameUz,
          nameRu: p.nameRu,
          unit: p.unit,
          kind: p.kind,
          categoryId: p.categoryId,
          brand: p.brand,
          imageUrl: p.images[0]?.url ?? null,
          priceFrom: Math.min(...prices),
          basePriceFrom: Math.min(...priced.map((v) => Number(v.basePrice))),
          stockLevel: levels.reduce((best, l) => (LEVEL_RANK[l] > LEVEL_RANK[best] ? l : best)),
          variantCount: p.variants.length,
          variantId: p.variants.length === 1 ? p.variants[0]!.id : null,
          minQty,
          qtyStep: p.qtyStep.toString(),
        },
      ];
    });
  }

  async detail(id: string, userId: string | null) {
    const groupId = await this.pricing.priceGroupOf(userId);
    const p = await this.prisma.product.findFirst({
      where: { id, isActive: true, category: { isActive: true } },
      include: {
        brand: { select: { id: true, name: true, logoUrl: true } },
        category: { select: { id: true, nameUz: true, nameRu: true, slug: true, parentId: true } },
        images: { orderBy: { sortOrder: 'asc' }, select: { id: true, url: true } },
        variants: {
          where: { isActive: true },
          orderBy: { sku: 'asc' },
          include: variantPricingInclude(groupId),
        },
      },
    });
    if (!p || p.variants.length === 0) throw AppException.notFound('Mahsulot');

    const minQty = p.minQty.toString();
    return {
      id: p.id,
      nameUz: p.nameUz,
      nameRu: p.nameRu,
      descriptionUz: p.descriptionUz,
      descriptionRu: p.descriptionRu,
      unit: p.unit,
      kind: p.kind,
      minQty: p.minQty,
      qtyStep: p.qtyStep,
      weightKg: p.weightKg,
      board: p.kind === 'BOARD' ? { lengthMm: p.boardLengthMm, widthMm: p.boardWidthMm, thicknessMm: p.thicknessMm } : null,
      brand: p.brand,
      category: p.category,
      images: p.images,
      variants: p.variants.map((v) => {
        const groupPrice = v.groupPrices[0] ? Number(v.groupPrices[0].price) : null;
        return {
          id: v.id,
          sku: v.sku,
          attributes: v.attributes,
          swatchUrl: v.swatchUrl,
          basePrice: v.basePrice,
          price: priceOf(v, minQty).unitPrice,
          groupPrice,
          // Pog'onalar faqat shaxsiy narxdan arzon bo'lsa ko'rsatiladi
          tiers: v.priceTiers
            .filter((t) => groupPrice === null || Number(t.price) < groupPrice)
            .map((t) => ({ minQty: t.minQty, price: t.price })),
          stockLevel: variantStockLevel(v),
          leadTimeDays: v.availability === 'ON_ORDER' ? v.leadTimeDays : null,
        };
      }),
    };
  }

  async bySku(sku: string, userId: string | null) {
    const v = await this.prisma.productVariant.findFirst({
      where: { sku: { equals: sku.trim(), mode: 'insensitive' }, isActive: true, product: { isActive: true } },
      select: { id: true, productId: true },
    });
    if (!v) throw AppException.notFound('Artikul');
    const product = await this.detail(v.productId, userId);
    return { variantId: v.id, product };
  }

  /** Mijoz avval buyurtma qilgan, hozir ham sotuvdagi variantlar — eng so'nggisi birinchi */
  async buyAgain(userId: string): Promise<BuyAgainItem[]> {
    const rows = await this.prisma.orderItem.findMany({
      where: {
        status: 'ACTIVE',
        order: { customerId: userId, status: { not: 'CANCELLED' } },
        variant: { isActive: true, product: { isActive: true, category: { isActive: true } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { variantId: true, qty: true, createdAt: true },
    });
    const seen = new Set<string>();
    const latest = rows.filter((r) => !seen.has(r.variantId) && seen.add(r.variantId)).slice(0, BUY_AGAIN_LIMIT);
    if (latest.length === 0) return [];

    const groupId = await this.pricing.priceGroupOf(userId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: latest.map((r) => r.variantId) } },
      include: variantPricingInclude(groupId),
    });
    const byId = new Map(variants.map((v) => [v.id, v]));
    const cards = new Map((await this.cards([...new Set(variants.map((v) => v.productId))], userId)).map((c) => [c.id, c]));

    return latest.flatMap((r) => {
      const v = byId.get(r.variantId);
      const product = v && cards.get(v.productId);
      if (!v || !product) return [];
      const lastQty = r.qty.toString();
      return [
        {
          variantId: v.id,
          sku: v.sku,
          attributes: v.attributes,
          lastQty,
          lastOrderedAt: r.createdAt,
          unitPrice: priceOf(v, lastQty).unitPrice,
          stockLevel: variantStockLevel(v),
          product,
        },
      ];
    });
  }

  quote(input: PricingQuoteInput, userId: string | null) {
    return this.pricing.priceLines(userId, input.items);
  }
}
