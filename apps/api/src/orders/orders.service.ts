import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  addDays,
  businessDate,
  CUSTOMER_CANCELLABLE,
  isValidIsoDate,
  MAX_DELIVERY_DAYS_AHEAD,
  TERMINAL_STATUSES,
  type CreateOrderInput,
  type OrderListQuery,
  type Paginated,
} from '@mebel/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService, type Tx } from '../audit/audit.service.js';
import { OutboxService } from '../events/outbox.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { blockingIssues, CartService } from '../cart/cart.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { lockOrder } from './order-lock.js';
import { presentQuote } from './order-quotes.service.js';
import { OrderWorkflowService } from './order-workflow.service.js';

export const orderDetailInclude = {
  items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
  statusHistory: { orderBy: { createdAt: 'asc' }, select: { fromStatus: true, toStatus: true, comment: true, createdAt: true } },
  pickupWarehouse: { select: { id: true, name: true, addressText: true, phone: true, workHours: true } },
  payments: {
    orderBy: { createdAt: 'desc' },
    select: { id: true, amount: true, method: true, status: true, createdAt: true, rejectReason: true },
  },
  currentQuote: true,
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly workflow: OrderWorkflowService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Savatdan buyurtma. Idempotent: bir xil kalit bilan qayta so'rov — o'sha buyurtma qaytadi.
   * @returns replayed=true — yangi buyurtma yaratilmadi
   */
  async create(customer: AuthUser, input: CreateOrderInput, idempotencyKey: string) {
    const existing = await this.findByKey(customer.id, idempotencyKey);
    if (existing) return { order: existing, replayed: true };

    try {
      const { orderId, replayed } = await this.prisma.$transaction(
        (tx) => this.createInTx(tx, customer, input, idempotencyKey),
        { timeout: 15_000 },
      );
      if (!replayed) this.logger.log(`Yangi buyurtma ${orderId}`);
      return { order: await this.detail(customer.id, orderId), replayed };
    } catch (e) {
      // Ikki parallel so'rov bir xil kalit bilan: ikkinchisi unique cheklovga uriladi
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const order = await this.findByKey(customer.id, idempotencyKey);
        if (order) return { order, replayed: true };
      }
      throw e;
    }
  }

  private async createInTx(
    tx: Tx,
    customer: AuthUser,
    input: CreateOrderInput,
    idempotencyKey: string,
  ): Promise<{ orderId: string; replayed: boolean }> {
    // Bir xil kalitli parallel so'rovlar navbatga turadi; navbat kelganda buyurtma allaqachon bo'lsa — o'shani qaytaramiz
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${customer.id}:${idempotencyKey}`}, 0))`;
    const existing = await tx.order.findUnique({
      where: { customerId_idempotencyKey: { customerId: customer.id, idempotencyKey } },
      select: { id: true },
    });
    if (existing) return { orderId: existing.id, replayed: true };

    const user = await tx.user.findUniqueOrThrow({ where: { id: customer.id }, select: { fullName: true } });
    if (!user.fullName) {
      throw new AppException('PROFILE_INCOMPLETE', 'Buyurtmadan oldin ismingizni kiriting', HttpStatus.UNPROCESSABLE_ENTITY);
    }

    // Savat qatorlarini qulflaymiz: boshqa kalit bilan parallel buyurtma shu savatni ikkinchi marta ololmaydi
    await tx.$queryRaw`SELECT 1 FROM cart_items WHERE user_id = ${customer.id}::uuid FOR UPDATE`;
    const cart = await this.cart.view(customer.id, tx);
    if (cart.count === 0) throw new AppException('CART_EMPTY', 'Savat bo\'sh', HttpStatus.CONFLICT);
    if (cart.hasBlockingIssues) {
      throw new AppException('CART_HAS_ISSUES', 'Savatdagi ba\'zi tovarlarni tuzating', HttpStatus.CONFLICT, {
        lines: cart.lines.filter((l) => blockingIssues(l).length).map((l) => ({ variantId: l.variantId, sku: l.sku, issues: l.issues })),
      });
    }

    const delivery = await this.resolveDelivery(tx, customer.id, input);
    const [{ nextval }] = await tx.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('order_number_seq')`;
    const number = `MO-${businessDate().slice(0, 4)}-${String(nextval).padStart(6, '0')}`;

    const order = await tx.order.create({
      data: {
        number,
        customerId: customer.id,
        status: 'NEW',
        deliveryType: input.deliveryType,
        ...delivery,
        customerComment: input.comment ?? null,
        idempotencyKey,
        itemsTotal: BigInt(cart.itemsTotal),
        grandTotal: BigInt(cart.itemsTotal),
        totalWeightKg: cart.totalWeightKg,
        totalVolumeM3: cart.totalVolumeM3,
        items: {
          create: cart.lines.map((l) => ({
            variantId: l.variantId,
            sku: l.sku!,
            nameUz: l.nameUz!,
            nameRu: l.nameRu!,
            unit: l.unit as Prisma.OrderItemCreateWithoutOrderInput['unit'],
            attributes: (l.attributes ?? {}) as Prisma.InputJsonValue,
            requestedQty: l.qty,
            qty: l.qty,
            unitPrice: BigInt(l.unitPrice),
            lineTotal: BigInt(l.lineTotal),
          })),
        },
        statusHistory: { create: { fromStatus: null, toStatus: 'NEW', actorId: customer.id } },
      },
    });
    await tx.cartItem.deleteMany({ where: { userId: customer.id } });
    await this.audit.log({ actorId: customer.id, entity: 'order', entityId: order.id, action: 'create', after: { number, total: cart.itemsTotal } }, tx);
    await this.outbox.add(tx, 'order.created', { orderId: order.id });
    return { orderId: order.id, replayed: false };
  }

  private async resolveDelivery(tx: Tx, customerId: string, input: CreateOrderInput) {
    let deliveryDate: Date | null = null;
    if (input.deliveryDate) {
      const today = businessDate();
      if (!isValidIsoDate(input.deliveryDate) || input.deliveryDate < today || input.deliveryDate > addDays(today, MAX_DELIVERY_DAYS_AHEAD)) {
        throw new AppException('INVALID_DELIVERY_DATE', `Sana bugundan ${MAX_DELIVERY_DAYS_AHEAD} kungacha bo'lishi kerak`, HttpStatus.UNPROCESSABLE_ENTITY);
      }
      deliveryDate = new Date(`${input.deliveryDate}T00:00:00Z`);
    }

    if (input.deliveryType === 'DELIVERY') {
      const address = await tx.address.findFirst({ where: { id: input.addressId!, userId: customerId } });
      if (!address) throw AppException.notFound('Manzil');
      const { id: _id, userId: _u, createdAt: _c, ...snapshot } = address;
      return { addressSnapshot: snapshot, pickupWarehouseId: null, deliveryDate };
    }
    const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId!, isActive: true } });
    if (!warehouse) throw AppException.notFound('Ombor');
    return { addressSnapshot: Prisma.DbNull, pickupWarehouseId: warehouse.id, deliveryDate };
  }

  private async findByKey(customerId: string, idempotencyKey: string) {
    const order = await this.prisma.order.findUnique({
      where: { customerId_idempotencyKey: { customerId, idempotencyKey } },
      select: { id: true },
    });
    return order ? this.detail(customerId, order.id) : null;
  }

  async list(customerId: string, query: OrderListQuery): Promise<Paginated<unknown>> {
    const where: Prisma.OrderWhereInput = {
      customerId,
      ...(query.status && { status: query.status }),
      ...(query.active !== undefined && {
        status: query.active ? { notIn: [...TERMINAL_STATUSES] } : { in: [...TERMINAL_STATUSES] },
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          number: true,
          status: true,
          deliveryType: true,
          grandTotal: true,
          paidTotal: true,
          createdAt: true,
          currentQuote: { select: { status: true } },
          _count: {
            select: {
              items: { where: { status: 'ACTIVE' } },
              chatMessages: { where: { readByCustomerAt: null, sender: { role: { not: 'CUSTOMER' } } } },
            },
          },
        },
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items: rows.map(({ _count, currentQuote, ...o }) => ({
        ...o,
        itemsCount: _count.items,
        unreadMessages: _count.chatMessages,
        hasPendingQuote: o.status === 'QUOTED' && currentQuote?.status === 'PENDING',
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async detail(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      include: orderDetailInclude,
    });
    if (!order) throw AppException.notFound('Buyurtma');
    // Ichki maydonlar mijozga ko'rsatilmaydi
    const { idempotencyKey: _k, cancelledBy: _cb, currentQuote, ...rest } = order;
    return {
      ...rest,
      // Faqat javob kutayotgan taklif ko'rsatiladi
      pendingQuote: currentQuote?.status === 'PENDING' && order.status === 'QUOTED' ? presentQuote(currentQuote) : null,
      balanceDue: order.grandTotal - order.paidTotal,
      canCancel: CUSTOMER_CANCELLABLE.includes(order.status),
    };
  }

  async cancel(customer: AuthUser, orderId: string, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.customerId !== customer.id) throw AppException.notFound('Buyurtma');
      await this.workflow.cancel(tx, order, reason, customer);
    });
    return this.detail(customer.id, orderId);
  }

  async quotes(customerId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { quotes: { orderBy: { version: 'desc' } } },
    });
    if (!order) throw AppException.notFound('Buyurtma');
    return order.quotes.map(presentQuote);
  }
}
