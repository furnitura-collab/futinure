import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import type { Tx } from '../audit/audit.service.js';

type Qty = Prisma.Decimal;

/**
 * Buyurtma bo'yicha ombor amallari. Hammasi chaqiruvchining tranzaksiyasida.
 *
 * Qancha band qilingani alohida saqlanmaydi — stock_movements'dan hisoblanadi
 * (RESERVE − RELEASE). Shuning uchun bo'shatish har doim aniq band qilingan miqdorni qaytaradi.
 */
@Injectable()
export class OrderInventoryService {
  /**
   * Tasdiqlashda: har variant uchun atomik band qilish.
   * "Buyurtma asosida" (ON_ORDER) tovar qoldiq yetmasa band qilinmaydi — kelganda jo'natiladi.
   */
  async reserve(tx: Tx, orderId: string, actorId: string | null) {
    const need = await this.itemTotals(tx, orderId);
    const variants = await tx.productVariant.findMany({
      where: { id: { in: [...need.keys()] } },
      select: { id: true, sku: true, availability: true, stockQty: true, reservedQty: true },
    });
    const shortages: { sku: string; requested: string; available: string }[] = [];

    // Doim bir xil tartibda — ikki buyurtma bir-birini kutib qolmasin (deadlock)
    for (const v of [...variants].sort((a, b) => a.id.localeCompare(b.id))) {
      const qty = need.get(v.id)!;
      const updated = await tx.$executeRaw`
        UPDATE product_variants SET reserved_qty = reserved_qty + ${qty.toString()}::numeric
        WHERE id = ${v.id}::uuid AND stock_qty - reserved_qty >= ${qty.toString()}::numeric`;
      if (updated === 1) {
        await tx.stockMovement.create({ data: { variantId: v.id, type: 'RESERVE', qty, orderId, userId: actorId } });
      } else if (v.availability !== 'ON_ORDER') {
        const fresh = await tx.productVariant.findUniqueOrThrow({ where: { id: v.id }, select: { stockQty: true, reservedQty: true } });
        shortages.push({ sku: v.sku, requested: qty.toString(), available: fresh.stockQty.minus(fresh.reservedQty).toString() });
      }
    }
    if (shortages.length) {
      throw new AppException(
        'INSUFFICIENT_STOCK',
        'Omborda yetarli tovar yo\'q. Miqdorni tuzatib taklif yuboring',
        HttpStatus.CONFLICT,
        { shortages },
      );
    }
  }

  /** Bekor qilishda: band qilinganini to'liq qaytaradi */
  async release(tx: Tx, orderId: string, actorId: string | null, reason: string) {
    for (const [variantId, qty] of await this.netReserved(tx, orderId)) {
      await tx.$executeRaw`
        UPDATE product_variants SET reserved_qty = reserved_qty - ${qty.toString()}::numeric WHERE id = ${variantId}::uuid`;
      await tx.stockMovement.create({ data: { variantId, type: 'RELEASE', qty, orderId, userId: actorId, reason } });
    }
  }

  /** Jo'natishda (yo'lga chiqdi / olib ketildi): qoldiqdan yechiladi, rezerv yopiladi */
  async ship(tx: Tx, orderId: string, actorId: string | null) {
    const need = await this.itemTotals(tx, orderId);
    const reserved = await this.netReserved(tx, orderId);
    const ids = [...need.keys()].sort();
    const rows = await tx.$queryRaw<{ id: string; sku: string; stock_qty: Qty; reserved_qty: Qty }[]>`
      SELECT id, sku, stock_qty, reserved_qty FROM product_variants WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;

    const missing = rows
      .map((r) => {
        const qty = need.get(r.id)!;
        const ownReserve = reserved.get(r.id) ?? new Prisma.Decimal(0);
        // Boshqa buyurtmalar uchun band qilinganiga tegmasdan yechish mumkin bo'lgan miqdor
        const free = new Prisma.Decimal(r.stock_qty).minus(r.reserved_qty).plus(ownReserve);
        return free.lessThan(qty) ? { sku: r.sku, requested: qty.toString(), available: free.toString() } : null;
      })
      .filter((x) => x !== null);
    if (missing.length) {
      throw new AppException(
        'STOCK_NOT_RECEIVED',
        'Tovar omborda yetarli emas — avval kirim qiling',
        HttpStatus.CONFLICT,
        { shortages: missing },
      );
    }

    for (const id of ids) {
      const qty = need.get(id)!;
      const ownReserve = reserved.get(id);
      if (ownReserve) {
        await tx.stockMovement.create({ data: { variantId: id, type: 'RELEASE', qty: ownReserve, orderId, userId: actorId, reason: 'Jo\'natildi' } });
      }
      await tx.$executeRaw`
        UPDATE product_variants
        SET stock_qty = stock_qty - ${qty.toString()}::numeric,
            reserved_qty = reserved_qty - ${(ownReserve ?? 0).toString()}::numeric
        WHERE id = ${id}::uuid`;
      await tx.stockMovement.create({ data: { variantId: id, type: 'OUT', qty, orderId, userId: actorId } });
    }
  }

  /** Yetkazib bo'lmadi: tovar omborga qaytadi va yana shu buyurtmaga band qilinadi */
  async unship(tx: Tx, orderId: string, actorId: string | null, reason: string) {
    const rows = await tx.$queryRaw<{ variant_id: string; qty: Qty }[]>`
      SELECT variant_id, SUM(CASE type WHEN 'OUT' THEN qty ELSE -qty END) AS qty
      FROM stock_movements WHERE order_id = ${orderId}::uuid AND type IN ('OUT', 'IN')
      GROUP BY variant_id HAVING SUM(CASE type WHEN 'OUT' THEN qty ELSE -qty END) > 0
      ORDER BY variant_id`;
    for (const r of rows) {
      const qty = new Prisma.Decimal(r.qty);
      await tx.$executeRaw`
        UPDATE product_variants
        SET stock_qty = stock_qty + ${qty.toString()}::numeric, reserved_qty = reserved_qty + ${qty.toString()}::numeric
        WHERE id = ${r.variant_id}::uuid`;
      await tx.stockMovement.create({ data: { variantId: r.variant_id, type: 'IN', qty, orderId, userId: actorId, reason } });
      await tx.stockMovement.create({ data: { variantId: r.variant_id, type: 'RESERVE', qty, orderId, userId: actorId, reason } });
    }
  }

  async netReserved(tx: Tx, orderId: string): Promise<Map<string, Qty>> {
    const rows = await tx.$queryRaw<{ variant_id: string; qty: Qty }[]>`
      SELECT variant_id, SUM(CASE type WHEN 'RESERVE' THEN qty ELSE -qty END) AS qty
      FROM stock_movements WHERE order_id = ${orderId}::uuid AND type IN ('RESERVE', 'RELEASE')
      GROUP BY variant_id HAVING SUM(CASE type WHEN 'RESERVE' THEN qty ELSE -qty END) > 0
      ORDER BY variant_id`;
    return new Map(rows.map((r) => [r.variant_id, new Prisma.Decimal(r.qty)]));
  }

  /** Faol qatorlar bo'yicha har variantga jami miqdor (bir variant ikki qatorda bo'lishi mumkin) */
  private async itemTotals(tx: Tx, orderId: string): Promise<Map<string, Qty>> {
    const items = await tx.orderItem.findMany({
      where: { orderId, status: 'ACTIVE' },
      select: { variantId: true, qty: true },
    });
    const totals = new Map<string, Qty>();
    for (const i of items) {
      if (i.qty.isZero()) continue;
      totals.set(i.variantId, (totals.get(i.variantId) ?? new Prisma.Decimal(0)).plus(i.qty));
    }
    return totals;
  }
}
