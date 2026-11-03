import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CART_MAX_ITEMS,
  isBlockingIssue,
  type CartBulkAddInput,
} from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import type { Tx } from '../audit/audit.service.js';
import { PricingService, type LineIssue, type PricedLine } from '../catalog/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CartView {
  lines: PricedLine[];
  count: number;
  itemsTotal: number;
  totalWeightKg: number;
  totalVolumeM3: number;
  hasIssues: boolean;
  /** true bo'lsa buyurtma berib bo'lmaydi */
  hasBlockingIssues: boolean;
}

export function blockingIssues(line: PricedLine): LineIssue[] {
  return line.issues.filter((i) => isBlockingIssue(i.code));
}

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  async view(userId: string, db: Tx = this.prisma): Promise<CartView> {
    const rows = await db.cartItem.findMany({ where: { userId }, orderBy: { updatedAt: 'asc' } });
    const priced = await this.pricing.priceLines(
      userId,
      rows.map((r) => ({ variantId: r.variantId, qty: r.qty.toString() })),
      db,
    );
    return {
      lines: priced.lines,
      count: rows.length,
      itemsTotal: priced.itemsTotal,
      totalWeightKg: priced.totalWeightKg,
      totalVolumeM3: priced.totalVolumeM3,
      hasIssues: priced.hasIssues,
      hasBlockingIssues: priced.lines.some((l) => blockingIssues(l).length > 0),
    };
  }

  /** Miqdorni o'rnatadi (qo'shmaydi). Qoidaga zid miqdor saqlanmaydi */
  async setItem(userId: string, variantId: string, qty: string): Promise<CartView> {
    await this.validate(userId, variantId, qty);
    await this.ensureCapacity(userId, [variantId]);
    await this.prisma.cartItem.upsert({
      where: { userId_variantId: { userId, variantId } },
      create: { userId, variantId, qty },
      update: { qty },
    });
    return this.view(userId);
  }

  async removeItem(userId: string, variantId: string): Promise<CartView> {
    await this.prisma.cartItem.deleteMany({ where: { userId, variantId } });
    return this.view(userId);
  }

  async clear(userId: string) {
    await this.prisma.cartItem.deleteMany({ where: { userId } });
  }

  /** SKU ro'yxati bo'yicha qo'shish. Mavjud miqdorga qo'shiladi. Har SKU natijasi alohida */
  async bulkAdd(userId: string, input: CartBulkAddInput) {
    const skus = input.items.map((i) => i.sku);
    const variants = await this.prisma.productVariant.findMany({
      where: { sku: { in: skus, mode: 'insensitive' } },
      select: { id: true, sku: true },
    });
    const bySku = new Map(variants.map((v) => [v.sku.toUpperCase(), v.id]));
    const results: { sku: string; status: 'ADDED' | string; qty?: string; issues?: LineIssue[] }[] = [];

    for (const item of input.items) {
      const variantId = bySku.get(item.sku.toUpperCase());
      if (!variantId) {
        results.push({ sku: item.sku, status: 'NOT_FOUND' });
        continue;
      }
      const existing = await this.prisma.cartItem.findUnique({ where: { userId_variantId: { userId, variantId } } });
      const qty = existing ? existing.qty.plus(item.qty).toString() : item.qty;
      const issues = await this.issuesFor(userId, variantId, qty);
      if (issues.length) {
        results.push({ sku: item.sku, status: issues[0]!.code, issues });
        continue;
      }
      try {
        await this.ensureCapacity(userId, [variantId]);
      } catch {
        results.push({ sku: item.sku, status: 'CART_FULL' });
        continue;
      }
      await this.prisma.cartItem.upsert({
        where: { userId_variantId: { userId, variantId } },
        create: { userId, variantId, qty },
        update: { qty },
      });
      results.push({ sku: item.sku, status: 'ADDED', qty });
    }
    return { cart: await this.view(userId), results };
  }

  /**
   * Eski buyurtmani savatga qo'shadi. Narxlar joriy narx bilan — farq ko'rsatiladi.
   * Endi sotilmayotgan tovarlar o'tkazib yuboriladi.
   */
  async reorder(userId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId: userId },
      include: { items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw AppException.notFound('Buyurtma');

    const added: { sku: string; qty: string; oldUnitPrice: number; newUnitPrice: number }[] = [];
    const skipped: { sku: string; reason: string }[] = [];

    for (const item of order.items) {
      const qty = item.qty.toString();
      const existing = await this.prisma.cartItem.findUnique({
        where: { userId_variantId: { userId, variantId: item.variantId } },
      });
      const total = existing ? existing.qty.plus(qty).toString() : qty;
      const { lines } = await this.pricing.priceLines(userId, [{ variantId: item.variantId, qty: total }]);
      const line = lines[0]!;
      const hard = line.issues.find((i) => i.code === 'NOT_FOUND' || i.code === 'INACTIVE' || i.code === 'OUT_OF_STOCK');
      if (hard) {
        skipped.push({ sku: item.sku, reason: hard.code });
        continue;
      }
      // Miqdor qoidasi o'zgargan bo'lsa ham qo'shamiz — savatda muammo sifatida ko'rinadi
      await this.prisma.cartItem.upsert({
        where: { userId_variantId: { userId, variantId: item.variantId } },
        create: { userId, variantId: item.variantId, qty: total },
        update: { qty: total },
      });
      added.push({ sku: item.sku, qty, oldUnitPrice: Number(item.unitPrice), newUnitPrice: line.unitPrice });
    }
    return { cart: await this.view(userId), added, skipped };
  }

  private async issuesFor(userId: string, variantId: string, qty: string) {
    const { lines } = await this.pricing.priceLines(userId, [{ variantId, qty }]);
    return blockingIssues(lines[0]!);
  }

  private async validate(userId: string, variantId: string, qty: string) {
    const issues = await this.issuesFor(userId, variantId, qty);
    const issue = issues[0];
    if (!issue) return;
    if (issue.code === 'NOT_FOUND') throw AppException.notFound('Variant');
    if (issue.code === 'INACTIVE' || issue.code === 'OUT_OF_STOCK') {
      throw new AppException(issue.code, 'Tovar hozir sotuvda yo\'q', HttpStatus.CONFLICT);
    }
    throw new AppException('INVALID_QTY', 'Miqdor qoidaga mos emas', HttpStatus.UNPROCESSABLE_ENTITY, issue);
  }

  private async ensureCapacity(userId: string, variantIds: string[]) {
    const [count, existing] = await Promise.all([
      this.prisma.cartItem.count({ where: { userId } }),
      this.prisma.cartItem.count({ where: { userId, variantId: { in: variantIds } } }),
    ]);
    if (count - existing + variantIds.length > CART_MAX_ITEMS) {
      throw new AppException('CART_FULL', `Savatda ko'pi bilan ${CART_MAX_ITEMS} xil tovar`, HttpStatus.CONFLICT);
    }
  }
}
