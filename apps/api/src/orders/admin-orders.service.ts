import { Injectable } from '@nestjs/common';
import {
  availableTransitions,
  businessDate,
  TERMINAL_STATUSES,
  type AdminOrderListQuery,
  type OrderStatus,
  type Paginated,
  type Role,
} from '@mebel/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrderInventoryService } from './order-inventory.service.js';
import { presentQuote } from './order-quotes.service.js';

const KANBAN_STATUSES: OrderStatus[] = ['NEW', 'QUOTED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const KANBAN_LIMIT = 50;

const cardSelect = {
  id: true,
  number: true,
  status: true,
  version: true,
  deliveryType: true,
  grandTotal: true,
  paidTotal: true,
  paymentTerms: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, phone: true, fullName: true, customerProfile: { select: { type: true, companyName: true } } } },
  manager: { select: { id: true, fullName: true } },
  currentQuote: { select: { status: true, expiresAt: true } },
  _count: {
    select: {
      items: { where: { status: 'ACTIVE' } },
      chatMessages: { where: { readByStaffAt: null, sender: { role: 'CUSTOMER' } } },
    },
  },
} satisfies Prisma.OrderSelect;

type CardRow = Prisma.OrderGetPayload<{ select: typeof cardSelect }>;

function card({ _count, ...o }: CardRow) {
  return { ...o, itemsCount: _count.items, unreadMessages: _count.chatMessages, balanceDue: o.grandTotal - o.paidTotal };
}

/** Toshkent kunining boshi (UTC) */
function dayStart(isoDate: string) {
  return new Date(`${isoDate}T00:00:00+05:00`);
}

@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: OrderInventoryService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminOrderListQuery): Promise<Paginated<ReturnType<typeof card>>> {
    const where = this.where(query);
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: cardSelect,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { items: rows.map(card), total, page: query.page, limit: query.limit };
  }

  /** Kanban: har ustunda eng uzoq kutayotganlar birinchi */
  async kanban(query: Omit<AdminOrderListQuery, 'status' | 'page' | 'limit'>) {
    const base = this.where({ ...query, page: 1, limit: 1 });
    return Promise.all(
      KANBAN_STATUSES.map(async (status) => {
        const where = { ...base, status };
        const [rows, total] = await Promise.all([
          this.prisma.order.findMany({ where, orderBy: { updatedAt: 'asc' }, take: KANBAN_LIMIT, select: cardSelect }),
          this.prisma.order.count({ where }),
        ]);
        return { status, total, items: rows.map(card) };
      }),
    );
  }

  private where(q: AdminOrderListQuery): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = [];
    if (q.status) and.push({ status: q.status });
    if (q.managerId) and.push({ managerId: q.managerId === 'none' ? null : q.managerId });
    if (q.customerId) and.push({ customerId: q.customerId });
    if (q.from) and.push({ createdAt: { gte: dayStart(q.from) } });
    if (q.to) and.push({ createdAt: { lt: new Date(dayStart(q.to).getTime() + 86_400_000) } });
    if (q.q) {
      const digits = q.q.replace(/\D/g, '');
      and.push({
        OR: [
          { number: { contains: q.q, mode: 'insensitive' } },
          { customer: { fullName: { contains: q.q, mode: 'insensitive' } } },
          { customer: { customerProfile: { companyName: { contains: q.q, mode: 'insensitive' } } } },
          ...(digits.length >= 4 ? [{ customer: { phone: { contains: digits } } }] : []),
        ],
      });
    }
    return { AND: and };
  }

  async detail(orderId: string, viewer: { role: Role }) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        customer: {
          select: {
            id: true,
            phone: true,
            fullName: true,
            customerProfile: { include: { priceGroup: { select: { id: true, name: true } } } },
            _count: { select: { orders: true } },
          },
        },
        manager: { select: { id: true, fullName: true, phone: true } },
        pickupWarehouse: true,
        quotes: { orderBy: { version: 'desc' } },
        statusHistory: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        delivery: { include: { driver: { select: { id: true, fullName: true, phone: true } } } },
      },
    });
    if (!order) throw AppException.notFound('Buyurtma');

    const actorIds = [...new Set(order.statusHistory.map((h) => h.actorId).filter((x): x is string => !!x))];
    const [actors, variants, ownReserved] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true, role: true } }),
      this.prisma.productVariant.findMany({
        where: { id: { in: order.items.map((i) => i.variantId) } },
        select: { id: true, stockQty: true, reservedQty: true, availability: true, isActive: true },
      }),
      this.inventory.netReserved(this.prisma, order.id),
    ]);
    const actorById = new Map(actors.map((a) => [a.id, a]));
    const variantById = new Map(variants.map((v) => [v.id, v]));

    const profile = order.customer.customerProfile;
    const terminal = TERMINAL_STATUSES.includes(order.status);
    return {
      ...order,
      items: order.items.map((i) => {
        const v = variantById.get(i.variantId);
        const own = ownReserved.get(i.variantId) ?? new Prisma.Decimal(0);
        // Shu buyurtma uchun ishlatilishi mumkin bo'lgan miqdor (o'z rezervi bilan)
        const available = v ? v.stockQty.minus(v.reservedQty).plus(own) : new Prisma.Decimal(0);
        return {
          ...i,
          stock: v && i.status === 'ACTIVE' && !terminal
            ? {
                available,
                reserved: own,
                onOrder: v.availability === 'ON_ORDER',
                isActive: v.isActive,
                shortage: available.lessThan(i.qty) && v.availability !== 'ON_ORDER',
              }
            : null,
        };
      }),
      quotes: order.quotes.map(presentQuote),
      statusHistory: order.statusHistory.map((h) => ({ ...h, actor: h.actorId ? (actorById.get(h.actorId) ?? null) : null })),
      balanceDue: order.grandTotal - order.paidTotal,
      creditCheck: profile
        ? {
            creditLimit: profile.creditLimit,
            balance: profile.balanceCached,
            exposureAfter: profile.balanceCached + (terminal || order.status === 'DELIVERED' ? 0n : order.grandTotal),
            exceeds:
              order.paymentTerms === 'CREDIT' &&
              !terminal &&
              profile.balanceCached + order.grandTotal > profile.creditLimit,
          }
        : null,
      availableTransitions: availableTransitions(order.status, viewer.role, order.deliveryType)
        .filter((t) => t.to !== 'QUOTED')
        .map((t) => ({ to: t.to, requiresComment: !!t.requiresComment })),
      canQuote: order.status === 'NEW' || order.status === 'QUOTED',
      today: businessDate(),
    };
  }

  async assign(orderId: string, managerId: string | null, actor: AuthUser) {
    if (managerId) {
      const m = await this.prisma.user.findFirst({
        where: { id: managerId, role: { in: ['MANAGER', 'SUPER_ADMIN'] }, isActive: true },
      });
      if (!m) throw new AppException('NOT_A_MANAGER', 'Bunday faol menejer yo\'q', 422);
    }
    const before = await this.prisma.order.findUnique({ where: { id: orderId }, select: { managerId: true } });
    if (!before) throw AppException.notFound('Buyurtma');
    // Versiya oshirilmaydi: biriktirish tarkibni o'zgartirmaydi va mijozdagi taklifni eskirtirmasligi kerak
    await this.prisma.order.update({ where: { id: orderId }, data: { managerId } });
    await this.audit.log({ actorId: actor.id, entity: 'order', entityId: orderId, action: 'assign', before, after: { managerId } });
    return this.detail(orderId, actor);
  }

  managers() {
    return this.prisma.user.findMany({
      where: { role: { in: ['MANAGER', 'SUPER_ADMIN'] }, isActive: true },
      select: { id: true, fullName: true, phone: true, role: true },
      orderBy: { fullName: 'asc' },
    });
  }
}
