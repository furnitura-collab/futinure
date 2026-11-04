import { HttpStatus, Injectable } from '@nestjs/common';
import type { StockMovementInput } from '@mebel/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService, type Tx } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { pageArgs, paginate } from '../common/pagination.js';

interface LockedVariant {
  id: string;
  stock_qty: Prisma.Decimal;
  reserved_qty: Prisma.Decimal;
}

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async move(input: StockMovementInput, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const v = await this.lock(tx, input.variantId);
      const before = { stockQty: v.stock_qty, reservedQty: v.reserved_qty };

      let delta: Prisma.Decimal;
      if (input.type === 'IN') {
        delta = new Prisma.Decimal(input.qty);
      } else {
        const actual = new Prisma.Decimal(input.actualQty);
        delta = actual.minus(v.stock_qty);
        if (delta.isZero()) throw new AppException('NO_CHANGE', 'Qoldiq o\'zgarmagan');
        if (actual.lessThan(v.reserved_qty)) {
          throw new AppException(
            'STOCK_BELOW_RESERVED',
            'Haqiqiy qoldiq buyurtmalarga band qilinganidan kam. Avval buyurtmalarni ko\'rib chiqing',
            HttpStatus.CONFLICT,
            { reservedQty: v.reserved_qty.toString() },
          );
        }
      }

      const updated = await tx.productVariant.update({
        where: { id: v.id },
        data: { stockQty: { increment: delta } },
        select: { id: true, sku: true, stockQty: true, reservedQty: true },
      });
      const movement = await tx.stockMovement.create({
        data: {
          variantId: v.id,
          type: input.type,
          qty: delta,
          reason: input.reason ?? null,
          userId: actor.id,
        },
      });
      await this.audit.log(
        { actorId: actor.id, entity: 'variant', entityId: v.id, action: `stock_${input.type.toLowerCase()}`, before, after: updated },
        tx,
      );
      return { variant: updated, movement };
    });
  }

  /** SELECT ... FOR UPDATE: parallel kirim/rezerv bir-birini buzmasin */
  private async lock(tx: Tx, variantId: string): Promise<LockedVariant> {
    const rows = await tx.$queryRaw<LockedVariant[]>`
      SELECT id, stock_qty, reserved_qty FROM product_variants WHERE id = ${variantId}::uuid FOR UPDATE`;
    const v = rows[0];
    if (!v) throw AppException.notFound('Variant');
    return v;
  }

  lowStock() {
    return this.prisma.$queryRaw<
      {
        variant_id: string;
        sku: string;
        product_id: string;
        name_uz: string;
        unit: string;
        stock_qty: Prisma.Decimal;
        reserved_qty: Prisma.Decimal;
        available_qty: Prisma.Decimal;
        low_stock_threshold: Prisma.Decimal;
        on_order: boolean;
      }[]
    >`
      SELECT v.id AS variant_id, v.sku, p.id AS product_id, p.name_uz, p.unit::text AS unit,
             v.stock_qty, v.reserved_qty, v.stock_qty - v.reserved_qty AS available_qty,
             v.low_stock_threshold, v.availability = 'ON_ORDER' AS on_order
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      WHERE v.is_active AND p.is_active AND v.stock_qty - v.reserved_qty <= v.low_stock_threshold
      ORDER BY (v.stock_qty - v.reserved_qty) ASC, p.name_uz ASC
      LIMIT 500`;
  }

  async movements(variantId: string, page: number, limit: number) {
    const where = { variantId };
    return paginate(
      { page, limit },
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...pageArgs({ page, limit }),
        include: { order: { select: { id: true, number: true } } },
      }),
      this.prisma.stockMovement.count({ where }),
    );
  }
}
