import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  computeOrderTotals,
  isBlockingIssue,
  lineTotal,
  type OrderTermsInput,
  type QuoteInput,
  type QuoteLine,
} from '@mebel/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService, type Tx } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { OutboxService } from '../events/outbox.service.js';
import { PricingService, type LineIssue } from '../catalog/pricing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderInventoryService } from './order-inventory.service.js';
import { OrderStateMachine } from './order-state-machine.service.js';
import { termsData, validateTerms, type Totals } from './order-terms.js';
import { lockOrder } from './order-lock.js';

const DEFAULT_TTL_HOURS = 24;

interface StoredChanges {
  lines: QuoteLine[];
  /** Taklif yaratilgandan keyingi buyurtma versiyasi. Qabul qilishda mos kelishi shart */
  orderVersion: number;
  terms: OrderTermsInput;
}

@Injectable()
export class OrderQuotesService {
  private readonly logger = new Logger(OrderQuotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly stateMachine: OrderStateMachine,
    private readonly inventory: OrderInventoryService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ───────────── Menejer: taklif yaratish ─────────────

  async create(orderId: string, input: QuoteInput, actor: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId, input.expectedVersion);
      if (order.status !== 'NEW' && order.status !== 'QUOTED') {
        throw new AppException('QUOTE_NOT_ALLOWED', 'Taklif faqat yangi buyurtmaga yuboriladi', HttpStatus.CONFLICT, { status: order.status });
      }

      const { lines, warnings } = await this.buildLines(tx, order, input);
      const totals: Totals = computeOrderTotals({
        lines: lines.filter((l) => l.action !== 'REMOVE'),
        servicesTotal: Number(order.servicesTotal),
        deliveryFee: input.deliveryFee,
        discountTotal: input.discountTotal,
      });
      const terms = pickTerms(input);
      validateTerms(terms, totals, order.customer.customerProfile);

      const ttlHours = input.expiresInHours ?? (await this.ttlHours(tx));
      const last = await tx.orderQuote.findFirst({ where: { orderId }, orderBy: { version: 'desc' }, select: { version: true } });
      await tx.orderQuote.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'SUPERSEDED' } });

      const orderVersion = order.version + 1;
      const quote = await tx.orderQuote.create({
        data: {
          orderId,
          version: (last?.version ?? 0) + 1,
          createdBy: actor.id,
          changes: { lines, orderVersion, terms } satisfies StoredChanges as unknown as Prisma.InputJsonValue,
          totals: totals as unknown as Prisma.InputJsonValue,
          paymentTerms: terms.paymentTerms,
          advanceAmount: BigInt(terms.advanceAmount),
          allowedMethods: terms.allowedMethods,
          managerNote: input.note ?? null,
          expiresAt: new Date(Date.now() + ttlHours * 3_600_000),
        },
      });

      const data = { currentQuoteId: quote.id, ...(order.managerId ? {} : { managerId: actor.id }) };
      if (order.status === 'NEW') {
        await this.stateMachine.transition(tx, order, 'QUOTED', actor, { comment: input.note, data });
      } else {
        // Taklif yangilandi — status o'zgarmaydi, lekin versiya oshadi
        await tx.order.update({ where: { id: orderId }, data: { ...data, version: { increment: 1 } } });
        await this.audit.log({ actorId: actor.id, entity: 'order', entityId: orderId, action: 'quote_revised', after: { version: quote.version } }, tx);
      }
      await this.outbox.add(tx, 'order.quote_created', { orderId, quoteId: quote.id });
      return { quote: presentQuote(quote), warnings };
    });
  }

  /**
   * Yakuniy qatorlar ro'yxati. Narx: o'zgargan/yangi qatorlar — joriy katalog narxi (yoki menejer narxi),
   * o'zgarmagan qatorlar — buyurtmadagi narx.
   */
  private async buildLines(tx: Tx, order: Awaited<ReturnType<typeof lockOrder>>, input: QuoteInput) {
    const items = order.items;
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const id of [...input.itemChanges.map((c) => c.itemId), ...input.replacements.map((r) => r.itemId)]) {
      if (!byId.has(id)) throw new AppException('ITEM_NOT_IN_ORDER', 'Qator bu buyurtmada yo\'q', HttpStatus.UNPROCESSABLE_ENTITY, { itemId: id });
    }
    const changes = new Map(input.itemChanges.map((c) => [c.itemId, c]));
    const replacements = new Map(input.replacements.map((r) => [r.itemId, r]));

    // Har yakuniy qator uchun: [harakat, eski qator, variant, miqdor, narx override]
    type Draft = { action: QuoteLine['action']; item: (typeof items)[number] | null; variantId: string; qty: string; override?: number };
    const drafts: Draft[] = [];
    for (const item of items) {
      const repl = replacements.get(item.id);
      const change = changes.get(item.id);
      if (repl) {
        drafts.push({ action: 'REPLACE', item, variantId: repl.variantId, qty: repl.qty, override: repl.unitPrice });
      } else if (change && Number(change.qty) === 0) {
        drafts.push({ action: 'REMOVE', item, variantId: item.variantId, qty: '0' });
      } else if (change && (!item.qty.equals(change.qty) || change.unitPrice !== undefined)) {
        drafts.push({ action: 'CHANGE', item, variantId: item.variantId, qty: change.qty, override: change.unitPrice });
      } else {
        drafts.push({ action: 'KEEP', item, variantId: item.variantId, qty: item.qty.toString() });
      }
    }
    for (const a of input.additions) {
      drafts.push({ action: 'ADD', item: null, variantId: a.variantId, qty: a.qty, override: a.unitPrice });
    }

    const active = drafts.filter((d) => d.action !== 'REMOVE');
    if (active.length === 0) {
      throw new AppException('QUOTE_EMPTY', 'Taklifda kamida bitta tovar bo\'lishi kerak. Buyurtmani bekor qilish uchun "Bekor qilish"dan foydalaning', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const priced = await this.pricing.priceLines(
      order.customerId,
      active.map((d) => ({ variantId: d.variantId, qty: d.qty })),
      tx,
    );

    const invalid: { variantId: string; sku: string | null; issues: LineIssue[] }[] = [];
    const warnings: { sku: string | null; issues: LineIssue[] }[] = [];
    const lines: QuoteLine[] = [];
    let p = 0;
    for (const d of drafts) {
      const old = d.item;
      if (d.action === 'REMOVE') {
        lines.push({ ...snapshotOf(old!), action: 'REMOVE', itemId: old!.id, oldQty: old!.qty.toString(), qty: '0', oldUnitPrice: Number(old!.unitPrice), unitPrice: Number(old!.unitPrice), lineTotal: 0 });
        continue;
      }
      const line = priced.lines[p++]!;
      const blocking = line.issues.filter((i) => isBlockingIssue(i.code));
      // O'zgarmagan qatordagi muammo menejerning qarori — faqat ogohlantirish
      if (blocking.length && d.action !== 'KEEP') invalid.push({ variantId: d.variantId, sku: line.sku, issues: blocking });
      const nonBlocking = line.issues.filter((i) => d.action === 'KEEP' || !isBlockingIssue(i.code));
      if (nonBlocking.length) warnings.push({ sku: line.sku ?? old?.sku ?? null, issues: nonBlocking });

      if (d.action === 'KEEP') {
        lines.push({ ...snapshotOf(old!), action: 'KEEP', itemId: old!.id, oldQty: d.qty, qty: d.qty, oldUnitPrice: Number(old!.unitPrice), unitPrice: Number(old!.unitPrice), lineTotal: Number(old!.lineTotal) });
        continue;
      }
      const unitPrice = d.override ?? line.unitPrice;
      lines.push({
        action: d.action,
        itemId: old?.id ?? null,
        variantId: d.variantId,
        sku: line.sku ?? '',
        nameUz: line.nameUz ?? '',
        nameRu: line.nameRu ?? '',
        unit: line.unit ?? '',
        attributes: line.attributes,
        oldQty: old && d.action === 'CHANGE' ? old.qty.toString() : null,
        qty: d.qty,
        oldUnitPrice: old && d.action === 'CHANGE' ? Number(old.unitPrice) : null,
        unitPrice,
        lineTotal: lineTotal(d.qty, unitPrice),
        replaces: d.action === 'REPLACE' ? { sku: old!.sku, nameUz: old!.nameUz, nameRu: old!.nameRu } : null,
      });
    }
    if (invalid.length) {
      throw new AppException('QUOTE_INVALID_LINES', 'Ba\'zi qatorlar noto\'g\'ri', HttpStatus.UNPROCESSABLE_ENTITY, { lines: invalid });
    }
    return { lines, warnings };
  }

  private async ttlHours(tx: Tx) {
    const s = await tx.setting.findUnique({ where: { key: 'quote.ttl_hours' } });
    return typeof s?.value === 'number' ? s.value : DEFAULT_TTL_HOURS;
  }

  // ───────────── Mijoz: qabul / rad ─────────────

  async accept(customer: AuthUser, orderId: string, quoteId: string) {
    await this.prisma.$transaction(async (tx) => {
      const { order, quote, changes } = await this.activeQuote(tx, customer, orderId, quoteId);
      if (order.version !== changes.orderVersion) {
        throw new AppException('ORDER_CONFLICT', 'Buyurtma taklifdan keyin o\'zgargan', HttpStatus.CONFLICT);
      }

      await this.applyLines(tx, orderId, changes.lines);
      await recalcWeight(tx, orderId);
      const totals = quote.totals as unknown as Totals;
      await tx.orderQuote.update({ where: { id: quote.id }, data: { status: 'ACCEPTED', respondedAt: new Date() } });
      await this.stateMachine.transition(tx, order, 'CONFIRMED', customer, { data: termsData(changes.terms, totals) });
      await this.inventory.reserve(tx, orderId, customer.id);
    });
  }

  async reject(customer: AuthUser, orderId: string, quoteId: string, comment: string) {
    await this.prisma.$transaction(async (tx) => {
      const { order, quote } = await this.activeQuote(tx, customer, orderId, quoteId);
      await tx.orderQuote.update({
        where: { id: quote.id },
        data: { status: 'REJECTED', customerComment: comment, respondedAt: new Date() },
      });
      await this.stateMachine.transition(tx, order, 'NEW', customer, { comment, data: { currentQuoteId: null } });
    });
  }

  private async activeQuote(tx: Tx, customer: AuthUser, orderId: string, quoteId: string) {
    const order = await lockOrder(tx, orderId);
    if (order.customerId !== customer.id) throw AppException.notFound('Buyurtma');
    const quote = await tx.orderQuote.findFirst({ where: { id: quoteId, orderId } });
    if (!quote) throw AppException.notFound('Taklif');
    if (order.status !== 'QUOTED' || order.currentQuoteId !== quote.id || quote.status !== 'PENDING') {
      throw new AppException('QUOTE_NOT_ACTIVE', 'Bu taklif endi amal qilmaydi', HttpStatus.CONFLICT, { status: quote.status });
    }
    if (quote.expiresAt < new Date()) {
      throw new AppException('QUOTE_EXPIRED', 'Taklif muddati o\'tgan. Menejer yangi taklif yuboradi', HttpStatus.CONFLICT);
    }
    return { order, quote, changes: quote.changes as unknown as StoredChanges };
  }

  private async applyLines(tx: Tx, orderId: string, lines: QuoteLine[]) {
    for (const l of lines) {
      switch (l.action) {
        case 'KEEP':
          break;
        case 'CHANGE':
          await tx.orderItem.update({
            where: { id: l.itemId! },
            data: { qty: l.qty, unitPrice: BigInt(l.unitPrice), lineTotal: BigInt(l.lineTotal) },
          });
          break;
        case 'REMOVE':
          await tx.orderItem.update({ where: { id: l.itemId! }, data: { status: 'REMOVED' } });
          break;
        case 'REPLACE':
        case 'ADD':
          if (l.action === 'REPLACE') await tx.orderItem.update({ where: { id: l.itemId! }, data: { status: 'REMOVED' } });
          await tx.orderItem.create({
            data: {
              orderId,
              variantId: l.variantId,
              sku: l.sku,
              nameUz: l.nameUz,
              nameRu: l.nameRu,
              unit: l.unit as Prisma.OrderItemCreateManyInput['unit'],
              attributes: (l.attributes ?? {}) as Prisma.InputJsonValue,
              requestedQty: l.qty,
              qty: l.qty,
              unitPrice: BigInt(l.unitPrice),
              lineTotal: BigInt(l.lineTotal),
              replacedItemId: l.action === 'REPLACE' ? l.itemId : null,
            },
          });
          break;
      }
    }
  }

  // ───────────── Tizim: muddati o'tgan takliflar ─────────────

  /** @returns qancha taklif muddati o'tgan deb belgilandi */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.prisma.orderQuote.findMany({
      where: { status: 'PENDING', expiresAt: { lt: now } },
      select: { id: true, orderId: true },
      take: 100,
    });
    for (const q of due) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const order = await lockOrder(tx, q.orderId);
          const { count } = await tx.orderQuote.updateMany({ where: { id: q.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
          if (count && order.status === 'QUOTED' && order.currentQuoteId === q.id) {
            await this.stateMachine.transition(tx, order, 'NEW', null, {
              comment: 'Taklif muddati o\'tdi',
              data: { currentQuoteId: null },
            });
          }
        });
      } catch (e) {
        this.logger.error(`Taklif ${q.id} muddatini yopib bo'lmadi`, e as Error);
      }
    }
    return due.length;
  }
}

/** Tarkib o'zgargach og'irlik va hajm (yetkazishda mashina tanlash uchun) */
async function recalcWeight(tx: Tx, orderId: string) {
  await tx.$executeRaw`
    UPDATE orders SET
      total_weight_kg = t.weight,
      total_volume_m3 = t.volume
    FROM (
      SELECT COALESCE(SUM(oi.qty * COALESCE(p.weight_kg, 0)), 0) AS weight,
             COALESCE(SUM(oi.qty * COALESCE(p.volume_m3, 0)), 0) AS volume
      FROM order_items oi
      JOIN product_variants v ON v.id = oi.variant_id
      JOIN products p ON p.id = v.product_id
      WHERE oi.order_id = ${orderId}::uuid AND oi.status = 'ACTIVE'
    ) t
    WHERE orders.id = ${orderId}::uuid`;
}

function pickTerms(input: QuoteInput): OrderTermsInput {
  const { paymentTerms, advanceAmount, allowedMethods, deliveryFee, discountTotal, deliveryDate, vehicleType } = input;
  return { paymentTerms, advanceAmount, allowedMethods, deliveryFee, discountTotal, deliveryDate, vehicleType };
}

function snapshotOf(item: { variantId: string; sku: string; nameUz: string; nameRu: string; unit: string; attributes: unknown }) {
  return { variantId: item.variantId, sku: item.sku, nameUz: item.nameUz, nameRu: item.nameRu, unit: item.unit, attributes: item.attributes };
}

/** Taklif — mijoz va admin uchun bir xil ko'rinish */
export function presentQuote(q: {
  id: string;
  version: number;
  status: string;
  changes: unknown;
  totals: unknown;
  paymentTerms: string;
  advanceAmount: bigint;
  allowedMethods: string[];
  managerNote: string | null;
  customerComment: string | null;
  expiresAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
}) {
  const changes = q.changes as StoredChanges;
  return {
    id: q.id,
    version: q.version,
    status: q.status,
    lines: changes.lines,
    totals: q.totals as Totals,
    terms: changes.terms,
    paymentTerms: q.paymentTerms,
    advanceAmount: q.advanceAmount,
    allowedMethods: q.allowedMethods,
    managerNote: q.managerNote,
    customerComment: q.customerComment,
    expiresAt: q.expiresAt,
    respondedAt: q.respondedAt,
    createdAt: q.createdAt,
  };
}
