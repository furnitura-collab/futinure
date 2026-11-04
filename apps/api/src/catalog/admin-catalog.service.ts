import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AdminProductListQuery,
  BrandInput,
  CategoryInput,
  CategoryUpdate,
  GroupPricesInput,
  ImageInput,
  Paginated,
  PriceGroupInput,
  PriceTiersInput,
  ProductInput,
  ProductUpdate,
  VariantInput,
  VariantUpdate,
} from '@mebel/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { categoryWithDescendants, wouldCreateCycle } from './category-tree.js';
import { variantStockLevel } from './pricing.service.js';
import { pageArgs } from '../common/pagination.js';

const adminVariantSelect = {
  id: true,
  sku: true,
  attributes: true,
  swatchUrl: true,
  basePrice: true,
  stockQty: true,
  reservedQty: true,
  lowStockThreshold: true,
  availability: true,
  leadTimeDays: true,
  isActive: true,
  updatedAt: true,
  priceTiers: { orderBy: { minQty: 'asc' }, select: { minQty: true, price: true } },
  groupPrices: { select: { priceGroupId: true, price: true, priceGroup: { select: { name: true } } } },
} satisfies Prisma.ProductVariantSelect;

type AdminVariantRow = Prisma.ProductVariantGetPayload<{ select: typeof adminVariantSelect }>;

/** Admin variant ko'rinishi: aniq qoldiq, band va mavjud */
function presentVariant(v: AdminVariantRow) {
  return {
    ...v,
    availableQty: v.stockQty.minus(v.reservedQty),
    onOrder: v.availability === 'ON_ORDER',
    stockLevel: variantStockLevel(v),
  };
}

@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ───────────── Kategoriyalar ─────────────

  categories() {
    return this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { nameUz: 'asc' }],
      include: { _count: { select: { products: true, children: true } } },
    });
  }

  async createCategory(input: CategoryInput, actor: AuthUser) {
    if (input.parentId) await this.ensureCategory(input.parentId);
    const category = await this.prisma.category.create({ data: input });
    await this.audit.log({ actorId: actor.id, entity: 'category', entityId: category.id, action: 'create', after: category });
    return category;
  }

  async updateCategory(id: string, input: CategoryUpdate, actor: AuthUser) {
    const before = await this.ensureCategory(id);
    if (input.parentId !== undefined && input.parentId !== before.parentId) {
      const rows = await this.prisma.category.findMany({ select: { id: true, parentId: true } });
      if (input.parentId === id || wouldCreateCycle(rows, id, input.parentId)) {
        throw new AppException('CATEGORY_CYCLE', 'Kategoriya o\'zining ichiga joylashtirilmaydi');
      }
    }
    const after = await this.prisma.category.update({ where: { id }, data: input });
    await this.audit.log({ actorId: actor.id, entity: 'category', entityId: id, action: 'update', before, after });
    return after;
  }

  async deleteCategory(id: string, actor: AuthUser) {
    const before = await this.ensureCategory(id);
    const [products, children] = await Promise.all([
      this.prisma.product.count({ where: { categoryId: id } }),
      this.prisma.category.count({ where: { parentId: id } }),
    ]);
    if (products || children) {
      throw new AppException('CATEGORY_NOT_EMPTY', 'Kategoriyada mahsulot yoki ichki kategoriya bor. O\'chirish o\'rniga nofaol qiling', HttpStatus.CONFLICT, { products, children });
    }
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, entity: 'category', entityId: id, action: 'delete', before });
  }

  private async ensureCategory(id: string) {
    const c = await this.prisma.category.findUnique({ where: { id } });
    if (!c) throw AppException.notFound('Kategoriya');
    return c;
  }

  // ───────────── Brendlar va narx guruhlari ─────────────

  brands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { products: true } } } });
  }

  createBrand(input: BrandInput) {
    return this.prisma.brand.create({ data: input });
  }

  updateBrand(id: string, input: Partial<BrandInput>) {
    return this.prisma.brand.update({ where: { id }, data: input });
  }

  async deleteBrand(id: string) {
    if (await this.prisma.product.count({ where: { brandId: id } })) {
      throw new AppException('BRAND_IN_USE', 'Brend mahsulotlarda ishlatilmoqda', HttpStatus.CONFLICT);
    }
    await this.prisma.brand.delete({ where: { id } });
  }

  priceGroups() {
    return this.prisma.priceGroup.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { customers: true, prices: true } } },
    });
  }

  createPriceGroup(input: PriceGroupInput) {
    return this.prisma.priceGroup.create({ data: input });
  }

  updatePriceGroup(id: string, input: Partial<PriceGroupInput>) {
    return this.prisma.priceGroup.update({ where: { id }, data: input });
  }

  async deletePriceGroup(id: string) {
    if (await this.prisma.customerProfile.count({ where: { priceGroupId: id } })) {
      throw new AppException('PRICE_GROUP_IN_USE', 'Guruhda mijozlar bor', HttpStatus.CONFLICT);
    }
    await this.prisma.priceGroup.delete({ where: { id } });
  }

  // ───────────── Mahsulotlar ─────────────

  async products(query: AdminProductListQuery): Promise<Paginated<unknown>> {
    const and: Prisma.ProductWhereInput[] = [];
    if (query.categoryId) {
      and.push({ categoryId: { in: await categoryWithDescendants(this.prisma, query.categoryId) } });
    }
    if (query.brandId) and.push({ brandId: query.brandId });
    if (query.isActive !== undefined) and.push({ isActive: query.isActive });
    if (query.q) {
      and.push({
        OR: [
          { nameUz: { contains: query.q, mode: 'insensitive' } },
          { nameRu: { contains: query.q, mode: 'insensitive' } },
          { code: { contains: query.q, mode: 'insensitive' } },
          { variants: { some: { sku: { contains: query.q, mode: 'insensitive' } } } },
        ],
      });
    }
    if (query.lowStock) {
      const ids = await this.lowStockProductIds();
      and.push({ id: { in: ids } });
    }

    const where = { AND: and };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        ...pageArgs(query),
        include: {
          category: { select: { id: true, nameUz: true } },
          brand: { select: { id: true, name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
          variants: { orderBy: { sku: 'asc' }, select: adminVariantSelect },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((p) => ({ ...p, variants: p.variants.map(presentVariant) })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private async lowStockProductIds() {
    const rows = await this.prisma.$queryRaw<{ product_id: string }[]>`
      SELECT DISTINCT product_id FROM product_variants
      WHERE is_active AND stock_qty - reserved_qty <= low_stock_threshold`;
    return rows.map((r) => r.product_id);
  }

  async product(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, nameUz: true, nameRu: true } },
        brand: { select: { id: true, name: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: { sku: 'asc' }, select: adminVariantSelect },
      },
    });
    if (!p) throw AppException.notFound('Mahsulot');
    return { ...p, variants: p.variants.map(presentVariant) };
  }

  async createProduct(input: ProductInput, actor: AuthUser) {
    await this.ensureCategory(input.categoryId);
    const product = await this.prisma.product.create({ data: input });
    await this.audit.log({ actorId: actor.id, entity: 'product', entityId: product.id, action: 'create', after: product });
    return this.product(product.id);
  }

  async updateProduct(id: string, input: ProductUpdate, actor: AuthUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw AppException.notFound('Mahsulot');
    if (input.categoryId) await this.ensureCategory(input.categoryId);

    const kind = input.kind ?? before.kind;
    const length = input.boardLengthMm !== undefined ? input.boardLengthMm : before.boardLengthMm;
    const width = input.boardWidthMm !== undefined ? input.boardWidthMm : before.boardWidthMm;
    if (kind === 'BOARD' && (length == null || width == null)) {
      throw new AppException('BOARD_DIMENSIONS_REQUIRED', 'Plita uchun o\'lchamlar majburiy', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const after = await this.prisma.product.update({ where: { id }, data: input });
    await this.audit.log({ actorId: actor.id, entity: 'product', entityId: id, action: 'update', before, after });
    return this.product(id);
  }

  /** Buyurtmalarda ishlatilgan mahsulot o'chirilmaydi — faqat nofaol qilinadi */
  async deleteProduct(id: string, actor: AuthUser) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw AppException.notFound('Mahsulot');
    const used = await this.prisma.orderItem.count({ where: { variant: { productId: id } } });
    if (used) {
      throw new AppException('PRODUCT_IN_USE', 'Mahsulot buyurtmalarda bor. O\'chirish o\'rniga nofaol qiling', HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { variant: { productId: id } } });
      await tx.product.delete({ where: { id } });
      await this.audit.log({ actorId: actor.id, entity: 'product', entityId: id, action: 'delete', before }, tx);
    });
  }

  // ───────────── Variantlar ─────────────

  async createVariant(productId: string, input: VariantInput, actor: AuthUser) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw AppException.notFound('Mahsulot');
    const { onOrder, basePrice, ...rest } = input;
    const variant = await this.prisma.productVariant.create({
      data: {
        ...rest,
        productId,
        basePrice: BigInt(basePrice),
        availability: onOrder ? 'ON_ORDER' : 'IN_STOCK',
      },
    });
    await this.audit.log({ actorId: actor.id, entity: 'variant', entityId: variant.id, action: 'create', after: variant });
    return this.variant(variant.id);
  }

  async variant(id: string) {
    const v = await this.prisma.productVariant.findUnique({ where: { id }, select: adminVariantSelect });
    if (!v) throw AppException.notFound('Variant');
    return presentVariant(v);
  }

  async updateVariant(id: string, input: VariantUpdate, actor: AuthUser) {
    const { onOrder, basePrice, ...rest } = input;
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.productVariant.findUnique({ where: { id } });
      if (!before) throw AppException.notFound('Variant');

      const data: Prisma.ProductVariantUpdateInput = { ...rest };
      if (onOrder !== undefined) data.availability = onOrder ? 'ON_ORDER' : 'IN_STOCK';
      if (basePrice !== undefined && BigInt(basePrice) !== before.basePrice) {
        data.basePrice = BigInt(basePrice);
        await tx.priceHistory.create({
          data: { variantId: id, oldPrice: before.basePrice, newPrice: BigInt(basePrice), source: 'MANUAL', changedBy: actor.id },
        });
      }
      const after = await tx.productVariant.update({ where: { id }, data });
      await this.audit.log({ actorId: actor.id, entity: 'variant', entityId: id, action: 'update', before, after }, tx);
    });
    return this.variant(id);
  }

  async deleteVariant(id: string, actor: AuthUser) {
    const before = await this.prisma.productVariant.findUnique({ where: { id } });
    if (!before) throw AppException.notFound('Variant');
    if (await this.prisma.orderItem.count({ where: { variantId: id } })) {
      throw new AppException('VARIANT_IN_USE', 'Variant buyurtmalarda bor. O\'chirish o\'rniga nofaol qiling', HttpStatus.CONFLICT);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({ where: { variantId: id } });
      await tx.productVariant.delete({ where: { id } });
      await this.audit.log({ actorId: actor.id, entity: 'variant', entityId: id, action: 'delete', before }, tx);
    });
  }

  async setPriceTiers(variantId: string, tiers: PriceTiersInput, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.variantPriceTier.findMany({ where: { variantId } });
      if (!(await tx.productVariant.count({ where: { id: variantId } }))) throw AppException.notFound('Variant');
      await tx.variantPriceTier.deleteMany({ where: { variantId } });
      await tx.variantPriceTier.createMany({
        data: tiers.map((t) => ({ variantId, minQty: t.minQty, price: BigInt(t.price) })),
      });
      await this.audit.log({ actorId: actor.id, entity: 'variant', entityId: variantId, action: 'set_price_tiers', before, after: tiers }, tx);
    });
    return this.variant(variantId);
  }

  async setGroupPrices(variantId: string, prices: GroupPricesInput, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      if (!(await tx.productVariant.count({ where: { id: variantId } }))) throw AppException.notFound('Variant');
      const groups = await tx.priceGroup.count({ where: { id: { in: prices.map((p) => p.priceGroupId) } } });
      if (groups !== prices.length) throw AppException.notFound('Narx guruhi');
      const before = await tx.variantGroupPrice.findMany({ where: { variantId } });
      await tx.variantGroupPrice.deleteMany({ where: { variantId } });
      await tx.variantGroupPrice.createMany({
        data: prices.map((p) => ({ variantId, priceGroupId: p.priceGroupId, price: BigInt(p.price) })),
      });
      await this.audit.log({ actorId: actor.id, entity: 'variant', entityId: variantId, action: 'set_group_prices', before, after: prices }, tx);
    });
    return this.variant(variantId);
  }

  priceHistory(variantId: string) {
    return this.prisma.priceHistory.findMany({
      where: { variantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  // ───────────── Rasmlar ─────────────

  async addImage(productId: string, input: ImageInput) {
    if (!(await this.prisma.product.count({ where: { id: productId } }))) throw AppException.notFound('Mahsulot');
    return this.prisma.productImage.create({ data: { productId, ...input } });
  }

  async reorderImages(productId: string, imageIds: string[]) {
    await this.prisma.$transaction(
      imageIds.map((id, i) => this.prisma.productImage.updateMany({ where: { id, productId }, data: { sortOrder: i } })),
    );
  }

  async deleteImage(productId: string, imageId: string) {
    const { count } = await this.prisma.productImage.deleteMany({ where: { id: imageId, productId } });
    if (!count) throw AppException.notFound('Rasm');
  }
}
