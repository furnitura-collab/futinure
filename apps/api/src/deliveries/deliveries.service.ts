import { HttpStatus, Injectable } from '@nestjs/common';
import {
  businessDate,
  type AssignDeliveryInput,
  type DriverDeliverInput,
  type DriverFailInput,
  type DriverStartInput,
  type OrderStatus,
} from '@mebel/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../auth/decorators.js';
import { OutboxService } from '../events/outbox.service.js';
import { OrderWorkflowService } from '../orders/order-workflow.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const DELIVERY_PROOF_PURPOSE = 'DELIVERY_PROOF';

/** Shu statuslarda haydovchi biriktirish/almashtirish mumkin (yo'lga chiqqandan keyin — yo'q) */
const ASSIGNABLE: readonly OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY'];
/** Haydovchi ro'yxatidagi "faol" yetkazishlar */
const ACTIVE: OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

const orderSelect = {
  id: true,
  number: true,
  status: true,
  version: true,
  customerId: true,
  addressSnapshot: true,
  deliveryDate: true,
  deliverySlot: true,
  totalWeightKg: true,
  grandTotal: true,
  paidTotal: true,
  paymentTerms: true,
  customerComment: true,
  customer: { select: { fullName: true, phone: true, customerProfile: { select: { companyName: true } } } },
  payments: { where: { status: 'PENDING' }, select: { amount: true } },
  _count: { select: { items: { where: { status: 'ACTIVE' } } } },
} satisfies Prisma.OrderSelect;

const deliverySelect = {
  id: true,
  orderId: true,
  status: true,
  scheduledDate: true,
  slot: true,
  vehicleType: true,
  receiverName: true,
  deliveredAt: true,
  failReason: true,
  cashCollected: true,
  proofUploadId: true,
} satisfies Prisma.DeliverySelect;

type Row = Prisma.DeliveryGetPayload<{ select: typeof deliverySelect & { order: { select: typeof orderSelect } } }>;

/** Haydovchiga ko'rinadigan shakl: narxlar yo'q, faqat olinadigan summa */
function present({ order: o, ...d }: Row) {
  const { payments, _count, grandTotal, paidTotal, ...order } = o;
  const pending = payments.reduce((s, p) => s + p.amount, 0n);
  const due = grandTotal - paidTotal - pending;
  return {
    ...d,
    order: {
      ...order,
      itemsCount: _count.items,
      // Nasiyada pul olinmaydi; qolgan holatda — to'lanmagan qoldiq
      toCollect: o.paymentTerms === 'CREDIT' || due < 0n ? 0n : due,
    },
  };
}

/** Toshkent kunining boshi (UTC) */
const dayStart = (isoDate: string) => new Date(`${isoDate}T00:00:00+05:00`);

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: OrderWorkflowService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  // ───────────── Menejer ─────────────

  drivers() {
    return this.prisma.user.findMany({
      where: { role: 'DRIVER', isActive: true },
      select: {
        id: true,
        fullName: true,
        phone: true,
        _count: { select: { deliveries: { where: { order: { status: { in: ACTIVE } } } } } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async assign(orderId: string, input: AssignDeliveryInput, actor: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      if (!locked.length) throw AppException.notFound('Buyurtma');
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        select: { status: true, deliveryType: true, deliveryDate: true, vehicleType: true, delivery: true },
      });
      if (order.deliveryType !== 'DELIVERY') {
        throw new AppException('NOT_A_DELIVERY', 'Bu buyurtma olib ketiladi — haydovchi kerak emas', HttpStatus.UNPROCESSABLE_ENTITY);
      }
      if (!ASSIGNABLE.includes(order.status)) {
        throw new AppException('DELIVERY_LOCKED', 'Haydovchini faqat yo\'lga chiqqunga qadar almashtirish mumkin', HttpStatus.CONFLICT, {
          status: order.status,
        });
      }
      if (input.driverId) {
        const driver = await tx.user.findFirst({ where: { id: input.driverId, role: 'DRIVER', isActive: true } });
        if (!driver) throw new AppException('NOT_A_DRIVER', 'Bunday faol haydovchi yo\'q', HttpStatus.UNPROCESSABLE_ENTITY);
      }

      const before = order.delivery;
      const data = {
        driverId: input.driverId,
        scheduledDate:
          input.scheduledDate !== undefined
            ? input.scheduledDate && new Date(`${input.scheduledDate}T00:00:00Z`)
            : (before?.scheduledDate ?? order.deliveryDate),
        slot: input.slot !== undefined ? input.slot : (before?.slot ?? null),
        vehicleType: input.vehicleType !== undefined ? input.vehicleType : (before?.vehicleType ?? order.vehicleType),
        assignedBy: actor.id,
        // Muvaffaqiyatsiz urinishdan keyin qayta biriktirilsa — yangi urinish
        status: 'ASSIGNED' as const,
      };
      await tx.delivery.upsert({ where: { orderId }, create: { orderId, ...data }, update: data });
      await this.audit.log(
        {
          actorId: actor.id,
          entity: 'order',
          entityId: orderId,
          action: 'delivery:assign',
          before: before && { driverId: before.driverId, scheduledDate: before.scheduledDate },
          after: { driverId: data.driverId, scheduledDate: data.scheduledDate },
        },
        tx,
      );
      await this.outbox.add(tx, 'delivery.assigned', {
        orderId,
        driverId: input.driverId,
        previousDriverId: before?.driverId && before.driverId !== input.driverId ? before.driverId : null,
      });
    });
  }

  // ───────────── Haydovchi ─────────────

  /** Faol yetkazishlar (sana bo'yicha) va bugun topshirilganlar */
  async driverList(driver: AuthUser) {
    const rows = await this.prisma.delivery.findMany({
      where: {
        driverId: driver.id,
        OR: [{ order: { status: { in: ACTIVE } } }, { deliveredAt: { gte: dayStart(businessDate()) } }],
      },
      select: { ...deliverySelect, order: { select: orderSelect } },
      orderBy: [{ scheduledDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
    const items = rows.map(present);
    return {
      today: businessDate(),
      active: items.filter((d) => ACTIVE.includes(d.order.status)),
      done: items.filter((d) => !ACTIVE.includes(d.order.status)),
    };
  }

  async driverDetail(orderId: string, driver: AuthUser) {
    const row = await this.prisma.delivery.findFirst({
      where: { orderId, driverId: driver.id },
      select: {
        ...deliverySelect,
        order: {
          select: {
            ...orderSelect,
            items: {
              where: { status: 'ACTIVE' },
              orderBy: { createdAt: 'asc' },
              select: { id: true, sku: true, nameUz: true, nameRu: true, unit: true, qty: true, attributes: true },
            },
          },
        },
      },
    });
    if (!row) throw AppException.notFound('Buyurtma');
    const { items, ...order } = row.order;
    const presented = present({ ...row, order });
    return { ...presented, order: { ...presented.order, items } };
  }

  async start(orderId: string, input: DriverStartInput, driver: AuthUser) {
    await this.workflow.transition(orderId, { to: 'OUT_FOR_DELIVERY', expectedVersion: input.expectedVersion, overrideAdvance: false, overrideCreditLimit: false }, driver);
    return this.driverDetail(orderId, driver);
  }

  /** Topshirish: status + surat + naqd pul — bitta tranzaksiyada */
  async deliver(orderId: string, input: DriverDeliverInput, driver: AuthUser) {
    await this.prisma.$transaction(
      async (tx) => {
        let proofUploadId: string | null = null;
        if (input.proofUploadId) {
          const upload = await tx.upload.findFirst({
            where: { id: input.proofUploadId, ownerId: driver.id, purpose: DELIVERY_PROOF_PURPOSE },
            select: { id: true, delivery: { select: { id: true } } },
          });
          if (!upload) throw AppException.notFound('Surat');
          if (upload.delivery) throw new AppException('PROOF_ALREADY_USED', 'Surat boshqa yetkazishga biriktirilgan', HttpStatus.CONFLICT);
          proofUploadId = upload.id;
        }

        await this.workflow.apply(
          tx,
          orderId,
          {
            to: 'DELIVERED',
            receiverName: input.receiverName,
            comment: input.comment,
            expectedVersion: input.expectedVersion,
            overrideAdvance: false,
            overrideCreditLimit: false,
          },
          driver,
        );

        const cash = input.cashCollected ? BigInt(input.cashCollected) : 0n;
        await tx.delivery.update({
          where: { orderId },
          data: { proofUploadId, cashCollected: cash > 0n ? cash : null },
        });
        if (cash > 0n) {
          // Buyurtma apply() ichida qulflangan; paid_total o'zgarmagan (DELIVERED o'tishi uni o'zgartirmaydi)
          const o = await tx.order.findUniqueOrThrow({
            where: { id: orderId },
            select: { id: true, customerId: true, grandTotal: true, paidTotal: true },
          });
          await this.payments.createDriverCash(tx, o, cash, driver);
        }
      },
      { timeout: 20_000 },
    );
    return this.driverDetail(orderId, driver);
  }

  /** Yetkazib bo'lmadi — tovar omborga qaytadi (READY), menejer qayta rejalashtiradi */
  async fail(orderId: string, input: DriverFailInput, driver: AuthUser) {
    await this.workflow.transition(
      orderId,
      { to: 'READY', comment: input.reason, expectedVersion: input.expectedVersion, overrideAdvance: false, overrideCreditLimit: false },
      driver,
    );
    return this.driverDetail(orderId, driver);
  }

  // ───────────── Surat ─────────────

  /** Topshirish surati — xodimlar yoki shu yetkazishning haydovchisi */
  async proofFor(orderId: string, viewer: AuthUser) {
    const d = await this.prisma.delivery.findUnique({ where: { orderId }, select: { driverId: true, proof: true } });
    if (!d || (viewer.role === 'DRIVER' && d.driverId !== viewer.id)) throw AppException.notFound('Buyurtma');
    if (!d.proof) throw AppException.notFound('Surat');
    return d.proof;
  }
}
