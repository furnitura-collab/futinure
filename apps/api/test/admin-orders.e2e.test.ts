import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderQuotesService } from '../src/orders/order-quotes.service.js';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedAddress, seedCatalog, seedWarehouse, userWithToken } from './fixtures.js';

type Auth = Record<string, string>;

describe('buyurtmalar — admin oqimi (e2e)', () => {
  let ctx: TestContext;
  let c: Awaited<ReturnType<typeof seedCatalog>>;
  let customer: Awaited<ReturnType<typeof userWithToken>>;
  let manager: Auth;
  let admin: Auth;
  let warehouse: Auth;
  let driver: Auth;
  let driverId: string;
  let warehouseId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    c = await seedCatalog(ctx);
    customer = await userWithToken(ctx, 'CUSTOMER');
    manager = (await userWithToken(ctx, 'MANAGER')).auth;
    admin = (await userWithToken(ctx, 'SUPER_ADMIN')).auth;
    warehouse = (await userWithToken(ctx, 'WAREHOUSE')).auth;
    const d = await userWithToken(ctx, 'DRIVER');
    driver = d.auth;
    driverId = d.user.id;
    warehouseId = (await seedWarehouse(ctx)).id;
  });

  // ───── yordamchilar ─────

  async function placeOrder(lines: [string, number][], opts: { delivery?: boolean; who?: typeof customer } = {}) {
    const who = opts.who ?? customer;
    for (const [variantId, qty] of lines) {
      await ctx.http.put(`/api/v1/cart/items/${variantId}`).set(who.auth).send({ qty }).expect(200);
    }
    const body = opts.delivery
      ? { deliveryType: 'DELIVERY', addressId: (await seedAddress(ctx, who.user.id)).id }
      : { deliveryType: 'PICKUP', warehouseId };
    const res = await ctx.http
      .post('/api/v1/orders')
      .set(who.auth)
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(201);
    return res.body as { id: string; number: string; items: { id: string; variantId: string }[] };
  }

  const terms = (over: object = {}) => ({ paymentTerms: 'ON_DELIVERY', allowedMethods: ['CASH'], ...over });
  const go = (orderId: string, auth: Auth, body: object) =>
    ctx.http.post(`/api/v1/admin/orders/${orderId}/transition`).set(auth).send(body);
  const quote = (orderId: string, body: object) =>
    ctx.http.post(`/api/v1/admin/orders/${orderId}/quotes`).set(manager).send({ ...terms(), ...body });
  const variant = (id: string) => ctx.prisma.productVariant.findUniqueOrThrow({ where: { id } });
  const reserved = async (id: string) => (await variant(id)).reservedQty.toString();
  const stock = async (id: string) => (await variant(id)).stockQty.toString();

  // ───── testlar ─────

  describe('ro\'yxat va kanban', () => {
    it('yangi buyurtma NEW ustunida, qidiruv raqam va telefon bo\'yicha', async () => {
      const o = await placeOrder([[c.white.id, 12]]);
      const kanban = await ctx.http.get('/api/v1/admin/orders/kanban').set(manager).expect(200);
      const col = kanban.body.find((k: { status: string }) => k.status === 'NEW');
      expect(col.total).toBe(1);
      expect(col.items[0]).toMatchObject({ number: o.number, itemsCount: 1, grandTotal: 4_620_000, balanceDue: 4_620_000 });

      const byNumber = await ctx.http.get(`/api/v1/admin/orders?q=${o.number.slice(-6)}`).set(manager).expect(200);
      expect(byNumber.body.total).toBe(1);
      const byPhone = await ctx.http.get(`/api/v1/admin/orders?q=${customer.user.phone.slice(-7)}`).set(manager).expect(200);
      expect(byPhone.body.total).toBe(1);
      const unassigned = await ctx.http.get('/api/v1/admin/orders?managerId=none').set(manager).expect(200);
      expect(unassigned.body.total).toBe(1);
    });

    it('mijoz va omborchi admin ro\'yxatini ko\'rmaydi', async () => {
      await ctx.http.get('/api/v1/admin/orders').set(customer.auth).expect(403);
      await ctx.http.get('/api/v1/admin/orders').set(warehouse).expect(403);
    });

    it('batafsil: qoldiq yetishmasligi va mumkin bo\'lgan o\'tishlar', async () => {
      const o = await placeOrder([[c.black.id, 10], [c.hingeV.id, 4]]);
      const res = await ctx.http.get(`/api/v1/admin/orders/${o.id}`).set(manager).expect(200);
      const black = res.body.items.find((i: { sku: string }) => i.sku === 'KR-0190-16');
      expect(black.stock).toMatchObject({ available: '6', reserved: '0', shortage: true });
      expect(res.body.availableTransitions.map((t: { to: string }) => t.to)).toEqual(['CONFIRMED', 'CANCELLED']);
      expect(res.body.canQuote).toBe(true);
      expect(res.body.customer.customerProfile).toMatchObject({ creditLimit: 0, balanceCached: 0 });
    });
  });

  describe('to\'g\'ridan-to\'g\'ri tasdiqlash (NEW → CONFIRMED)', () => {
    it('shartlarsiz — 422', async () => {
      const o = await placeOrder([[c.white.id, 12]]);
      expect((await go(o.id, manager, { to: 'CONFIRMED' }).expect(422)).body.error.code).toBe('TERMS_REQUIRED');
    });

    it('shartlar, summa, rezerv, menejer biriktiriladi', async () => {
      const o = await placeOrder([[c.white.id, 12], [c.hingeV.id, 4]]);
      const res = await go(o.id, manager, {
        to: 'CONFIRMED',
        terms: terms({ deliveryFee: 0, discountTotal: 6_000, allowedMethods: ['CASH', 'CARD_TRANSFER'] }),
      }).expect(200);
      expect(res.body).toMatchObject({
        status: 'CONFIRMED',
        itemsTotal: 4_676_000,
        discountTotal: 6_000,
        grandTotal: 4_670_000,
        paymentTerms: 'ON_DELIVERY',
        allowedMethods: ['CASH', 'CARD_TRANSFER'],
        manager: { fullName: expect.stringContaining('MANAGER') },
      });
      expect(await reserved(c.white.id)).toBe('12');
      expect(await reserved(c.hingeV.id)).toBe('4');
      const movements = await ctx.prisma.stockMovement.count({ where: { orderId: o.id, type: 'RESERVE' } });
      expect(movements).toBe(2);
    });

    it('qoldiq yetmasa — 409, hech narsa band qilinmaydi', async () => {
      const o = await placeOrder([[c.hingeV.id, 4], [c.black.id, 10]]);
      const res = await go(o.id, manager, { to: 'CONFIRMED', terms: terms() }).expect(409);
      expect(res.body.error).toMatchObject({
        code: 'INSUFFICIENT_STOCK',
        details: { shortages: [{ sku: 'KR-0190-16', requested: '10', available: '6' }] },
      });
      expect(await reserved(c.hingeV.id)).toBe('0');
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('NEW');
    });

    it('omborchi tasdiqlay olmaydi', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      expect((await go(o.id, warehouse, { to: 'CONFIRMED', terms: terms() }).expect(403)).body.error.code).toBe(
        'TRANSITION_FORBIDDEN_ROLE',
      );
    });

    it('nasiya — kredit limiti bo\'lmagan mijozga mumkin emas', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      const res = await go(o.id, manager, { to: 'CONFIRMED', terms: terms({ paymentTerms: 'CREDIT' }) }).expect(422);
      expect(res.body.error.code).toBe('CREDIT_NOT_ALLOWED');
    });

    it('eskirgan versiya — 409', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      const res = await go(o.id, manager, { to: 'CONFIRMED', terms: terms(), expectedVersion: 99 }).expect(409);
      expect(res.body.error.code).toBe('ORDER_CONFLICT');
    });

    it('bir xil tovar uchun ikki buyurtma parallel — faqat bittasi band qiladi', async () => {
      const other = await userWithToken(ctx, 'CUSTOMER');
      const a = await placeOrder([[c.white.id, 70]]);
      const b = await placeOrder([[c.white.id, 70]], { who: other });
      const results = await Promise.all([
        go(a.id, manager, { to: 'CONFIRMED', terms: terms() }),
        go(b.id, admin, { to: 'CONFIRMED', terms: terms() }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await reserved(c.white.id)).toBe('70');
    });
  });

  describe('taklif (QUOTED)', () => {
    it('miqdorni tuzatish + tovar qo\'shish → mijoz qabul qiladi → CONFIRMED', async () => {
      const o = await placeOrder([[c.black.id, 10], [c.hingeV.id, 4]]);
      const blackItem = o.items.find((i) => i.variantId === c.black.id)!;

      const q = await quote(o.id, {
        itemChanges: [{ itemId: blackItem.id, qty: '6' }],
        additions: [{ variantId: c.slideV.id, qty: 2 }],
        deliveryFee: 80_000,
        paymentTerms: 'ADVANCE',
        advanceAmount: 500_000,
        allowedMethods: ['CASH', 'CARD_TRANSFER'],
        note: 'Qora LDSP faqat 6 ta bor',
      }).expect(201);
      expect(q.body.quote).toMatchObject({
        version: 1,
        status: 'PENDING',
        totals: { itemsTotal: 2_674_000, deliveryFee: 80_000, grandTotal: 2_754_000 },
      });
      expect(q.body.quote.lines.map((l: { action: string }) => l.action)).toEqual(['CHANGE', 'KEEP', 'ADD']);
      expect(q.body.quote.lines[0]).toMatchObject({ oldQty: '10', qty: '6', oldUnitPrice: 420_000, unitPrice: 420_000 });
      expect(q.body.order.status).toBe('QUOTED');

      // Mijoz ko'radi
      const seen = await ctx.http.get(`/api/v1/orders/${o.id}`).set(customer.auth).expect(200);
      expect(seen.body.pendingQuote).toMatchObject({ id: q.body.quote.id, managerNote: 'Qora LDSP faqat 6 ta bor' });
      const list = await ctx.http.get('/api/v1/orders').set(customer.auth).expect(200);
      expect(list.body.items[0].hasPendingQuote).toBe(true);

      const acc = await ctx.http
        .post(`/api/v1/orders/${o.id}/quotes/${q.body.quote.id}/accept`)
        .set(customer.auth)
        .expect(200);
      expect(acc.body).toMatchObject({
        status: 'CONFIRMED',
        grandTotal: 2_754_000,
        deliveryFee: 80_000,
        paymentTerms: 'ADVANCE',
        advanceAmount: 500_000,
        pendingQuote: null,
      });
      const black = acc.body.items.find((i: { sku: string }) => i.sku === 'KR-0190-16');
      expect(black).toMatchObject({ qty: '6', requestedQty: '10', lineTotal: 2_520_000 });
      expect(acc.body.items).toHaveLength(3);

      expect(await reserved(c.black.id)).toBe('6');
      expect(await reserved(c.hingeV.id)).toBe('4');
      // Og'irlik yangi tarkib bo'yicha: 6 list × 45 kg + 4 × 0.1 kg (slide og'irligi kiritilmagan)
      expect(acc.body.totalWeightKg).toBe('270.4');
      // "Buyurtma asosida" tovar qoldiqsiz — band qilinmaydi
      expect(await reserved(c.slideV.id)).toBe('0');
    });

    it('analog bilan almashtirish', async () => {
      const o = await placeOrder([[c.black.id, 10]]);
      const q = await quote(o.id, {
        replacements: [{ itemId: o.items[0]!.id, variantId: c.white.id, qty: 10 }],
      }).expect(201);
      expect(q.body.quote.lines[0]).toMatchObject({
        action: 'REPLACE',
        sku: 'KR-W980-16',
        unitPrice: 385_000,
        replaces: { sku: 'KR-0190-16' },
      });

      await ctx.http.post(`/api/v1/orders/${o.id}/quotes/${q.body.quote.id}/accept`).set(customer.auth).expect(200);
      const items = await ctx.prisma.orderItem.findMany({ where: { orderId: o.id }, orderBy: { createdAt: 'asc' } });
      expect(items.map((i) => [i.sku, i.status])).toEqual([
        ['KR-0190-16', 'REMOVED'],
        ['KR-W980-16', 'ACTIVE'],
      ]);
      expect(items[1]!.replacedItemId).toBe(items[0]!.id);
      expect(await reserved(c.white.id)).toBe('10');
    });

    it('menejer narxi (chegirma) va qatorni olib tashlash', async () => {
      const o = await placeOrder([[c.white.id, 12], [c.hingeV.id, 4]]);
      const [white, hinge] = o.items;
      const q = await quote(o.id, {
        itemChanges: [
          { itemId: white!.id, qty: '12', unitPrice: 370_000 },
          { itemId: hinge!.id, qty: '0' },
        ],
      }).expect(201);
      expect(q.body.quote.lines.map((l: { action: string }) => l.action)).toEqual(['CHANGE', 'REMOVE']);
      expect(q.body.quote.totals.itemsTotal).toBe(12 * 370_000);
    });

    it('validatsiya: begona qator, tugagan analog, bo\'sh taklif, katta avans', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      const other = await placeOrder([[c.hingeV.id, 2]]);
      const itemId = o.items[0]!.id;

      await quote(o.id, { itemChanges: [{ itemId: other.items[0]!.id, qty: '1' }] }).expect(422);

      await ctx.prisma.productVariant.update({ where: { id: c.black.id }, data: { stockQty: 0 } });
      const bad = await quote(o.id, { replacements: [{ itemId, variantId: c.black.id, qty: 1 }] }).expect(422);
      expect(bad.body.error).toMatchObject({ code: 'QUOTE_INVALID_LINES' });

      expect((await quote(o.id, { itemChanges: [{ itemId, qty: '0' }] }).expect(422)).body.error.code).toBe('QUOTE_EMPTY');
      expect(
        (await quote(o.id, { paymentTerms: 'ADVANCE', advanceAmount: 10_000_000 }).expect(422)).body.error.code,
      ).toBe('ADVANCE_TOO_LARGE');
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe('NEW');
    });

    it('qoldiqdan ko\'p KEEP qator — ogohlantirish, bloklamaydi', async () => {
      const o = await placeOrder([[c.black.id, 10]]);
      const q = await quote(o.id, { deliveryFee: 50_000 }).expect(201);
      expect(q.body.warnings).toEqual([{ sku: 'KR-0190-16', issues: [{ code: 'EXCEEDS_AVAILABLE', available: '6' }] }]);
    });

    it('qayta taklif eskisini bekor qiladi', async () => {
      const o = await placeOrder([[c.white.id, 12]]);
      const q1 = await quote(o.id, { deliveryFee: 100_000 }).expect(201);
      const q2 = await quote(o.id, { deliveryFee: 70_000 }).expect(201);
      expect(q2.body.quote.version).toBe(2);

      const old = await ctx.http.post(`/api/v1/orders/${o.id}/quotes/${q1.body.quote.id}/accept`).set(customer.auth).expect(409);
      expect(old.body.error.code).toBe('QUOTE_NOT_ACTIVE');
      const history = await ctx.http.get(`/api/v1/orders/${o.id}/quotes`).set(customer.auth).expect(200);
      expect(history.body.map((q: { status: string }) => q.status)).toEqual(['PENDING', 'SUPERSEDED']);
    });

    it('menejer biriktirish taklifni eskirtirmaydi', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      const q = await quote(o.id, {}).expect(201);
      const mgr = await ctx.http.get('/api/v1/admin/orders/managers').set(manager).expect(200);
      await ctx.http.patch(`/api/v1/admin/orders/${o.id}/assign`).set(admin).send({ managerId: mgr.body[1].id }).expect(200);
      await ctx.http.post(`/api/v1/orders/${o.id}/quotes/${q.body.quote.id}/accept`).set(customer.auth).expect(200);
    });

    it('rad etish → NEW, izoh majburiy', async () => {
      const o = await placeOrder([[c.white.id, 12]]);
      const q = await quote(o.id, { deliveryFee: 200_000 }).expect(201);
      const url = `/api/v1/orders/${o.id}/quotes/${q.body.quote.id}/reject`;
      await ctx.http.post(url).set(customer.auth).send({ comment: '' }).expect(422);
      const res = await ctx.http.post(url).set(customer.auth).send({ comment: 'Yetkazish qimmat' }).expect(200);
      expect(res.body).toMatchObject({ status: 'NEW', pendingQuote: null, currentQuoteId: null });

      const admin1 = await ctx.http.get(`/api/v1/admin/orders/${o.id}`).set(manager).expect(200);
      expect(admin1.body.quotes[0]).toMatchObject({ status: 'REJECTED', customerComment: 'Yetkazish qimmat' });
    });

    it('boshqa mijoz taklifga javob bera olmaydi', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      const q = await quote(o.id, {}).expect(201);
      const other = (await userWithToken(ctx, 'CUSTOMER')).auth;
      await ctx.http.post(`/api/v1/orders/${o.id}/quotes/${q.body.quote.id}/accept`).set(other).expect(404);
    });

    it('muddati o\'tgan taklif: qabul qilinmaydi, cron NEW ga qaytaradi', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      const q = await quote(o.id, { expiresInHours: 1 }).expect(201);
      await ctx.prisma.orderQuote.update({ where: { id: q.body.quote.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const res = await ctx.http.post(`/api/v1/orders/${o.id}/quotes/${q.body.quote.id}/accept`).set(customer.auth).expect(409);
      expect(res.body.error.code).toBe('QUOTE_EXPIRED');

      expect(await ctx.app.get(OrderQuotesService).expireDue()).toBe(1);
      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { statusHistory: true } });
      expect(order.status).toBe('NEW');
      expect(order.statusHistory.at(-1)).toMatchObject({ toStatus: 'NEW', actorId: null, comment: 'Taklif muddati o\'tdi' });
    });

    it('qabul paytida tovar tugab qolgan — 409, buyurtma QUOTED da qoladi', async () => {
      const o = await placeOrder([[c.black.id, 5]]);
      const q = await quote(o.id, {}).expect(201);
      await ctx.prisma.productVariant.update({ where: { id: c.black.id }, data: { stockQty: 2 } });
      const res = await ctx.http.post(`/api/v1/orders/${o.id}/quotes/${q.body.quote.id}/accept`).set(customer.auth).expect(409);
      expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { currentQuote: true } });
      expect(order.status).toBe('QUOTED');
      expect(order.currentQuote!.status).toBe('PENDING');
    });

    it('tasdiqlangan buyurtmaga taklif yuborilmaydi', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms() }).expect(200);
      expect((await quote(o.id, {}).expect(409)).body.error.code).toBe('QUOTE_NOT_ALLOWED');
    });
  });

  describe('to\'lov tekshiruvlari (CONFIRMED → PREPARING)', () => {
    it('avans to\'lanmagan — 409; menejer chetlab o\'ta olmaydi, super admin izoh bilan o\'tadi', async () => {
      const o = await placeOrder([[c.white.id, 12]]);
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms({ paymentTerms: 'ADVANCE', advanceAmount: 1_000_000 }) }).expect(200);

      const res = await go(o.id, manager, { to: 'PREPARING' }).expect(409);
      expect(res.body.error).toMatchObject({ code: 'ADVANCE_NOT_PAID', details: { required: 1_000_000, paid: 0 } });
      await go(o.id, manager, { to: 'PREPARING', overrideAdvance: true, comment: 'Ishonchli mijoz' }).expect(409);
      await go(o.id, admin, { to: 'PREPARING', overrideAdvance: true }).expect(409);
      await go(o.id, admin, { to: 'PREPARING', overrideAdvance: true, comment: 'Ishonchli mijoz' }).expect(200);
    });

    it('avans to\'langan bo\'lsa o\'tadi', async () => {
      const o = await placeOrder([[c.white.id, 12]]);
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms({ paymentTerms: 'ADVANCE', advanceAmount: 1_000_000 }) }).expect(200);
      await ctx.prisma.order.update({ where: { id: o.id }, data: { paidTotal: 1_000_000n } });
      await go(o.id, warehouse, { to: 'PREPARING' }).expect(200);
    });

    it('nasiya kredit limitidan oshsa — izoh bilan tasdiqlash kerak', async () => {
      await ctx.prisma.customerProfile.update({ where: { userId: customer.user.id }, data: { creditLimit: 1_000_000n } });
      const o = await placeOrder([[c.white.id, 12]]);
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms({ paymentTerms: 'CREDIT' }) }).expect(200);

      const detail = await ctx.http.get(`/api/v1/admin/orders/${o.id}`).set(manager).expect(200);
      expect(detail.body.creditCheck).toMatchObject({ creditLimit: 1_000_000, exposureAfter: 4_620_000, exceeds: true });

      const res = await go(o.id, manager, { to: 'PREPARING' }).expect(409);
      expect(res.body.error).toMatchObject({ code: 'CREDIT_LIMIT_EXCEEDED', details: { exposure: 4_620_000 } });
      await go(o.id, manager, { to: 'PREPARING', overrideCreditLimit: true, comment: 'Direktor ruxsat berdi' }).expect(200);
    });
  });

  describe('olib ketish oqimi (PICKUP)', () => {
    async function readyPickup(paymentTerms: object) {
      const o = await placeOrder([[c.white.id, 12], [c.hingeV.id, 4]]);
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms(paymentTerms) }).expect(200);
      await go(o.id, warehouse, { to: 'PREPARING' }).expect(200);
      await go(o.id, warehouse, { to: 'READY' }).expect(200);
      return o;
    }

    it('topshirishda: qoldiq yechiladi, rezerv yopiladi, qarz yoziladi; to\'lanmagani DELIVERED da qoladi', async () => {
      const o = await readyPickup({});
      await go(o.id, warehouse, { to: 'DELIVERED' }).expect(422);
      // Haydovchiga biriktirilmagan buyurtma unga ko'rinmaydi
      await go(o.id, driver, { to: 'DELIVERED', receiverName: 'Aziz' }).expect(404);

      const res = await go(o.id, warehouse, { to: 'DELIVERED', receiverName: 'Aziz aka' }).expect(200);
      expect(res.body.status).toBe('DELIVERED');
      expect(res.body.statusHistory.at(-1).comment).toBe('Qabul qildi: Aziz aka');

      expect(await stock(c.white.id)).toBe('108');
      expect(await reserved(c.white.id)).toBe('0');
      expect(await stock(c.hingeV.id)).toBe('396');

      const ledger = await ctx.prisma.ledgerEntry.findMany({ where: { customerId: customer.user.id } });
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({ type: 'DEBIT', amount: 4_676_000n, balanceAfter: 4_676_000n, orderId: o.id });
      const profile = await ctx.prisma.customerProfile.findUniqueOrThrow({ where: { userId: customer.user.id } });
      expect(profile.balanceCached).toBe(4_676_000n);
    });

    it('nasiya: topshirilganda avtomatik COMPLETED, to\'lov muddati belgilanadi', async () => {
      await ctx.prisma.customerProfile.update({
        where: { userId: customer.user.id },
        data: { creditLimit: 10_000_000n, paymentTermDays: 15 },
      });
      const o = await readyPickup({ paymentTerms: 'CREDIT' });
      const res = await go(o.id, warehouse, { to: 'DELIVERED', receiverName: 'Aziz' }).expect(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.dueDate).toBeTruthy();
      expect(res.body.statusHistory.map((h: { toStatus: string }) => h.toStatus).slice(-2)).toEqual(['DELIVERED', 'COMPLETED']);
    });

    it('to\'liq oldindan to\'langan: topshirilganda COMPLETED', async () => {
      const o = await placeOrder([[c.hingeV.id, 2]]);
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms({ paymentTerms: 'PREPAID' }) }).expect(200);
      await ctx.prisma.order.update({ where: { id: o.id }, data: { paidTotal: 28_000n } });
      await go(o.id, manager, { to: 'PREPARING' }).expect(200);
      await go(o.id, manager, { to: 'READY' }).expect(200);
      const res = await go(o.id, manager, { to: 'DELIVERED', receiverName: 'Aziz' }).expect(200);
      expect(res.body.status).toBe('COMPLETED');
    });

    it('COMPLETED ni qo\'lda qo\'yib bo\'lmaydi', async () => {
      const o = await readyPickup({});
      await go(o.id, warehouse, { to: 'DELIVERED', receiverName: 'Aziz' }).expect(200);
      await go(o.id, admin, { to: 'COMPLETED' }).expect(403);
    });
  });

  describe('yetkazish oqimi (DELIVERY)', () => {
    const assignDriver = (orderId: string) =>
      ctx.http.put(`/api/v1/admin/orders/${orderId}/delivery`).set(manager).send({ driverId }).expect(200);

    it('yo\'lga chiqdi → yetkazilmadi → qaytdi → qayta jo\'natildi → topshirildi', async () => {
      const o = await placeOrder([[c.white.id, 12]], { delivery: true });
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms({ deliveryFee: 80_000 }) }).expect(200);
      await assignDriver(o.id);
      await go(o.id, manager, { to: 'PREPARING' }).expect(200);
      await go(o.id, manager, { to: 'READY' }).expect(200);
      // Yetkazishda omborchi topshira olmaydi
      const wrong = await go(o.id, warehouse, { to: 'DELIVERED', receiverName: 'Aziz' }).expect(409);
      expect(wrong.body.error.code).toBe('TRANSITION_WRONG_DELIVERY_TYPE');

      await go(o.id, driver, { to: 'OUT_FOR_DELIVERY' }).expect(200);
      expect([await stock(c.white.id), await reserved(c.white.id)]).toEqual(['108', '0']);

      await go(o.id, driver, { to: 'READY' }).expect(409); // sabab kerak
      await go(o.id, driver, { to: 'READY', comment: 'Mijoz telefonni olmadi' }).expect(200);
      expect([await stock(c.white.id), await reserved(c.white.id)]).toEqual(['120', '12']);

      await go(o.id, driver, { to: 'OUT_FOR_DELIVERY' }).expect(200);
      const res = await go(o.id, driver, { to: 'DELIVERED' }).expect(200);
      expect(res.body).toMatchObject({ status: 'DELIVERED', grandTotal: 4_700_000 });
      expect([await stock(c.white.id), await reserved(c.white.id)]).toEqual(['108', '0']);
    });

    it('"buyurtma asosida" tovar kirim qilinmaguncha jo\'natilmaydi', async () => {
      const o = await placeOrder([[c.slideV.id, 2]], { delivery: true });
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms() }).expect(200);
      await assignDriver(o.id);
      await go(o.id, manager, { to: 'PREPARING' }).expect(200);
      await go(o.id, manager, { to: 'READY' }).expect(200);
      const res = await go(o.id, driver, { to: 'OUT_FOR_DELIVERY' }).expect(409);
      expect(res.body.error).toMatchObject({ code: 'STOCK_NOT_RECEIVED', details: { shortages: [{ sku: 'GTV-SL-500', available: '0' }] } });

      await ctx.http
        .post('/api/v1/admin/stock/movements')
        .set(warehouse)
        .send({ type: 'IN', variantId: c.slideV.id, qty: 5 })
        .expect(201);
      await go(o.id, driver, { to: 'OUT_FOR_DELIVERY' }).expect(200);
      expect(await stock(c.slideV.id)).toBe('3');
    });
  });

  describe('bekor qilish', () => {
    it('tasdiqlangan buyurtma bekor qilinsa rezerv bo\'shaydi', async () => {
      const o = await placeOrder([[c.white.id, 12]]);
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms() }).expect(200);
      await go(o.id, manager, { to: 'CANCELLED' }).expect(409); // sabab kerak
      await go(o.id, manager, { to: 'CANCELLED', comment: 'Mijoz rad etdi' }).expect(200);
      expect(await reserved(c.white.id)).toBe('0');
      const moves = await ctx.prisma.stockMovement.findMany({ where: { orderId: o.id }, orderBy: { createdAt: 'asc' } });
      expect(moves.map((m) => m.type)).toEqual(['RESERVE', 'RELEASE']);
    });

    it('READY ni faqat super admin bekor qiladi', async () => {
      const o = await placeOrder([[c.white.id, 12]]);
      await go(o.id, manager, { to: 'CONFIRMED', terms: terms() }).expect(200);
      await go(o.id, manager, { to: 'PREPARING' }).expect(200);
      await go(o.id, manager, { to: 'READY' }).expect(200);
      await go(o.id, manager, { to: 'CANCELLED', comment: 'x x x' }).expect(403);
      await go(o.id, admin, { to: 'CANCELLED', comment: 'Mijoz voz kechdi' }).expect(200);
      expect(await reserved(c.white.id)).toBe('0');
    });

    it('mijoz NEW buyurtmani bekor qilsa — rezerv yo\'q, xato ham yo\'q', async () => {
      const o = await placeOrder([[c.white.id, 1]]);
      await ctx.http.post(`/api/v1/orders/${o.id}/cancel`).set(customer.auth).send({ reason: 'Kerak emas' }).expect(200);
      expect(await ctx.prisma.stockMovement.count({ where: { orderId: o.id } })).toBe(0);
    });
  });
});
