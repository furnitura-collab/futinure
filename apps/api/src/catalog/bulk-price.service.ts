import { Injectable } from '@nestjs/common';
import { applyPercent, type BulkPriceInput } from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { categoryWithDescendants } from './category-tree.js';

const PREVIEW_LIMIT = 200;

/**
 * Ommaviy narx o'zgartirish (masalan dollar kursi oshganda +5%).
 * dryRun=true — faqat natijani ko'rsatadi. Asosiy narx, pog'onalar va guruh narxlari
 * bir xil foizga o'zgaradi, aks holda "chegirma" narxlar asosiy narxdan qimmat bo'lib qolishi mumkin.
 */
@Injectable()
export class BulkPriceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async run(input: BulkPriceInput, actor: AuthUser) {
    if (!input.categoryId && !input.brandId) {
      throw new AppException('FILTER_REQUIRED', 'Kategoriya yoki brend tanlang');
    }
    const where: Prisma.ProductVariantWhereInput = {
      product: {
        ...(input.categoryId && { categoryId: { in: await categoryWithDescendants(this.prisma, input.categoryId) } }),
        ...(input.brandId && { brandId: input.brandId }),
      },
    };
    const variants = await this.prisma.productVariant.findMany({
      where,
      orderBy: { sku: 'asc' },
      select: {
        id: true,
        sku: true,
        basePrice: true,
        product: { select: { nameUz: true } },
        priceTiers: { select: { id: true, price: true } },
        groupPrices: { select: { priceGroupId: true, price: true } },
      },
    });

    const calc = (price: bigint) => BigInt(applyPercent(Number(price), input.percent, input.roundTo));
    const changes = variants.map((v) => ({
      ...v,
      newBasePrice: calc(v.basePrice),
    }));

    const summary = {
      percent: input.percent,
      roundTo: input.roundTo,
      variantCount: changes.length,
      oldTotal: changes.reduce((s, c) => s + Number(c.basePrice), 0),
      newTotal: changes.reduce((s, c) => s + Number(c.newBasePrice), 0),
    };
    const preview = changes.slice(0, PREVIEW_LIMIT).map((c) => ({
      variantId: c.id,
      sku: c.sku,
      name: c.product.nameUz,
      oldPrice: c.basePrice,
      newPrice: c.newBasePrice,
    }));

    if (input.dryRun) return { dryRun: true, summary, preview };

    await this.prisma.$transaction(
      async (tx) => {
        for (const c of changes) {
          if (c.newBasePrice !== c.basePrice) {
            await tx.productVariant.update({ where: { id: c.id }, data: { basePrice: c.newBasePrice } });
            await tx.priceHistory.create({
              data: { variantId: c.id, oldPrice: c.basePrice, newPrice: c.newBasePrice, source: 'BULK', changedBy: actor.id },
            });
          }
          if (input.includeTiers) {
            for (const t of c.priceTiers) {
              await tx.variantPriceTier.update({ where: { id: t.id }, data: { price: calc(t.price) } });
            }
          }
          if (input.includeGroupPrices) {
            for (const g of c.groupPrices) {
              await tx.variantGroupPrice.update({
                where: { variantId_priceGroupId: { variantId: c.id, priceGroupId: g.priceGroupId } },
                data: { price: calc(g.price) },
              });
            }
          }
        }
        await this.audit.log(
          { actorId: actor.id, entity: 'catalog', entityId: 'bulk-price', action: 'bulk_price_update', after: { input, summary } },
          tx,
        );
      },
      { timeout: 120_000 },
    );
    return { dryRun: false, summary, preview };
  }
}
