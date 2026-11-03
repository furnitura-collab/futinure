import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderStateMachine } from '../src/orders/order-state-machine.service.js';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedAddress, seedCatalog, seedWarehouse, userWithToken } from './fixtures.js';

describe('buyurtmalar — mijoz (e2e)', () => {
  let ctx: TestContext;
  let c: Awaited<ReturnType<typeof seedCatalog>>;
  let customer: Awaited<ReturnType<typeof userWithToken>>;
  let auth: Record<string, string>;
  let warehouseId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    // Ketma-ketlikni ham qayta boshlaymiz — raqam formatini tekshirish uchun
    await ctx.prisma.$executeRawUnsafe('ALTER SEQUENCE order_number_seq RESTART WITH 1');
    c = await seedCatalog(ctx);
    customer = await userWithToken(ctx, 'CUSTOMER', { priceGroupId: c.usta.id });
    auth = customer.auth;
    warehouseId = (await seedWarehouse(ctx)).id;
  });

  const fillCart = async () => {
    await ctx.http.put(`/api/v1/cart/items/${c.white.id}`).set(auth).send({ qty: 12 }).expect(200);
    await ctx.http.put(`/api/v1/cart/items/${c.hingeV.id}`).set(auth).send({ qty: 4 }).expect(200);
  };
  const pickup = () => ({ deliveryType: 'PICKUP', warehouseId });
  const create = (body: object, key: string = randomUUID(), a = auth) =>
    ctx.http.post('/api/v1/orders').set(a).set('Idempotency-Key', key).send(body);

  describe('yaratish', () => {
    it('savatdan buyurtma: raqam, nusxa, summa, tarix, savat tozalanadi', async () => {
      await fillCart();
      const res = await create({ ...pickup(), comment: 'Ertalab olib ketaman' }).expect(201);
      const year = new Date().getFullYear();
      expect(res.body).toMatchObject({
        number: `MO-${year}-000001`,
        status: 'NEW',
        deliveryType: 'PICKUP',
        itemsTotal: 12 * 380_000 + 4 * 14_000,
        grandTotal: 12 * 380_000 + 4 * 14_000,
        paidTotal: 0,
        balanceDue: 12 * 380_000 + 4 * 14_000,
        customerComment: 'Ertalab olib ketaman',
        canCancel: true,
        pickupWarehouse: { name: 'Asosiy ombor' },
        totalWeightKg: '540.4',
      });
      expect(res.body.items).toHaveLength(2);
      expect(res.body.items[0]).toMatchObject({
        sku: 'KR-W980-16',
        nameUz: 'LDSP Kronospan 16 mm',
        unit: 'SHEET',
        qty: '12',
        requestedQty: '12',
        unitPrice: 380_000,
        lineTotal: 4_560_000,
        attributes: { color: 'Oq', decor_code: 'W980' },
      });
      expect(res.body.statusHistory).toEqual([expect.objectContaining({ fromStatus: null, toStatus: 'NEW' })]);
      expect(res.body).not.toHaveProperty('idempotencyKey');
      expect(await ctx.prisma.cartItem.count()).toBe(0);
    });

    it('narx nusxasi: katalog narxi o\'zgarsa buyurtma o\'zgarmaydi', async () => {
      await fillCart();
      const res = await create(pickup()).expect(201);
      await ctx.prisma.productVariant.update({ where: { id: c.white.id }, data: { basePrice: 999_000n } });
      await ctx.prisma.variantGroupPrice.deleteMany();
      await ctx.prisma.product.update({ where: { id: c.board.id }, data: { nameUz: 'Yangi nom' } });
      const again = await ctx.http.get(`/api/v1/orders/${res.body.id}`).set(auth).expect(200);
      expect(again.body.items[0]).toMatchObject({ nameUz: 'LDSP Kronospan 16 mm', unitPrice: 380_000 });
    });

    it('Idempotency-Key majburiy', async () => {
      await fillCart();
      await ctx.http.post('/api/v1/orders').set(auth).send(pickup()).expect(400);
      await create(pickup(), 'short').expect(400);
    });

    it('bir xil kalit bilan qayta yuborish — o\'sha buyurtma, 200', async () => {
      await fillCart();
      const key = randomUUID();
      const first = await create(pickup(), key).expect(201);
      const second = await create(pickup(), key).expect(200).expect('Idempotent-Replayed', 'true');
      expect(second.body.id).toBe(first.body.id);
      expect(await ctx.prisma.order.count()).toBe(1);
    });

    it('bir xil kalit bilan parallel so\'rovlar — bitta buyurtma', async () => {
      await fillCart();
      const key = randomUUID();
      const results = await Promise.all([create(pickup(), key), create(pickup(), key), create(pickup(), key)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(1);
      expect(await ctx.prisma.order.count()).toBe(1);
    });

    it('turli kalit bilan parallel — savat faqat bir marta buyurtmaga aylanadi', async () => {
      await fillCart();
      const results = await Promise.all([create(pickup()), create(pickup())]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(results.find((r) => r.status === 409)!.body.error.code).toBe('CART_EMPTY');
      expect(await ctx.prisma.order.count()).toBe(1);
    });

    it('bo\'sh savat — 409', async () => {
      expect((await create(pickup()).expect(409)).body.error.code).toBe('CART_EMPTY');
    });

    it('ism kiritilmagan — 422', async () => {
      await fillCart();
      await ctx.prisma.user.update({ where: { id: customer.user.id }, data: { fullName: null } });
      expect((await create(pickup()).expect(422)).body.error.code).toBe('PROFILE_INCOMPLETE');
    });

    it('savatda tugagan tovar — 409, qaysi qator ekanligi bilan', async () => {
      await fillCart();
      await ctx.prisma.productVariant.update({ where: { id: c.hingeV.id }, data: { stockQty: 0 } });
      const res = await create(pickup()).expect(409);
      expect(res.body.error.code).toBe('CART_HAS_ISSUES');
      expect(res.body.error.details.lines).toEqual([
        expect.objectContaining({ sku: 'GTV-PB-110', issues: [{ code: 'OUT_OF_STOCK' }] }),
      ]);
      expect(await ctx.prisma.order.count()).toBe(0);
      expect(await ctx.prisma.cartItem.count()).toBe(2);
    });

    it('qoldiqdan ko\'p so\'ralsa ham buyurtma qabul qilinadi (menejer tuzatadi)', async () => {
      await ctx.http.put(`/api/v1/cart/items/${c.black.id}`).set(auth).send({ qty: 10 }).expect(200);
      const res = await create(pickup()).expect(201);
      expect(res.body.items[0].qty).toBe('10');
    });

    describe('yetkazish', () => {
      it('manzilsiz — 422, boshqaning manzili — 404', async () => {
        await fillCart();
        await create({ deliveryType: 'DELIVERY' }).expect(422);
        const other = await userWithToken(ctx, 'CUSTOMER');
        const foreign = await seedAddress(ctx, other.user.id);
        await create({ deliveryType: 'DELIVERY', addressId: foreign.id }).expect(404);
      });

      it('manzil nusxasi saqlanadi, manzil o\'chirilsa ham', async () => {
        await fillCart();
        const address = await seedAddress(ctx, customer.user.id);
        const res = await create({ deliveryType: 'DELIVERY', addressId: address.id }).expect(201);
        await ctx.http.delete(`/api/v1/addresses/${address.id}`).set(auth).expect(204);
        const again = await ctx.http.get(`/api/v1/orders/${res.body.id}`).set(auth).expect(200);
        expect(again.body.addressSnapshot).toMatchObject({ addressText: 'Toshkent, Chilonzor 5-kvartal', floor: 2, lat: 41.28 });
      });

      it('sana: o\'tmish va 60 kundan uzoq rad etiladi', async () => {
        await fillCart();
        await create({ ...pickup(), deliveryDate: '2020-01-01' }).expect(422);
        await create({ ...pickup(), deliveryDate: '2099-01-01' }).expect(422);
        await create({ ...pickup(), deliveryDate: '2026-02-30' }).expect(422);
      });

      it('nofaol ombor — 404', async () => {
        await fillCart();
        await ctx.prisma.warehouse.update({ where: { id: warehouseId }, data: { isActive: false } });
        await create(pickup()).expect(404);
      });
    });
  });

  describe('ro\'yxat va ko\'rish', () => {
    it('faqat o\'z buyurtmalari', async () => {
      await fillCart();
      const res = await create(pickup()).expect(201);
      const other = (await userWithToken(ctx, 'CUSTOMER')).auth;
      await ctx.http.get(`/api/v1/orders/${res.body.id}`).set(other).expect(404);
      expect((await ctx.http.get('/api/v1/orders').set(other)).body.total).toBe(0);

      const list = await ctx.http.get('/api/v1/orders').set(auth).expect(200);
      expect(list.body.items[0]).toMatchObject({ number: res.body.number, itemsCount: 2, hasPendingQuote: false });
    });

    it('faol / tugagan filtri', async () => {
      await fillCart();
      const o = await create(pickup()).expect(201);
      await ctx.http.post(`/api/v1/orders/${o.body.id}/cancel`).set(auth).send({ reason: 'Fikrim o\'zgardi' }).expect(200);
      expect((await ctx.http.get('/api/v1/orders?active=true').set(auth)).body.total).toBe(0);
      expect((await ctx.http.get('/api/v1/orders?active=false').set(auth)).body.total).toBe(1);
    });
  });

  describe('bekor qilish', () => {
    it('NEW → CANCELLED, sabab va tarix bilan', async () => {
      await fillCart();
      const o = await create(pickup()).expect(201);
      const res = await ctx.http
        .post(`/api/v1/orders/${o.body.id}/cancel`)
        .set(auth)
        .send({ reason: 'Boshqa joydan oldim' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Boshqa joydan oldim', canCancel: false });
      expect(res.body.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual(['NEW', 'CANCELLED']);
    });

    it('sababsiz — 422; ikkinchi marta — 409', async () => {
      await fillCart();
      const o = await create(pickup()).expect(201);
      await ctx.http.post(`/api/v1/orders/${o.body.id}/cancel`).set(auth).send({ reason: '' }).expect(422);
      await ctx.http.post(`/api/v1/orders/${o.body.id}/cancel`).set(auth).send({ reason: 'Kerak emas' }).expect(200);
      const res = await ctx.http.post(`/api/v1/orders/${o.body.id}/cancel`).set(auth).send({ reason: 'Kerak emas' }).expect(409);
      expect(res.body.error.code).toBe('TRANSITION_NO_SUCH_TRANSITION');
    });

    it('tasdiqlangan buyurtmani mijoz bekor qila olmaydi — 403', async () => {
      await fillCart();
      const o = await create(pickup()).expect(201);
      await ctx.prisma.order.update({ where: { id: o.body.id }, data: { status: 'CONFIRMED' } });
      const res = await ctx.http.post(`/api/v1/orders/${o.body.id}/cancel`).set(auth).send({ reason: 'Kerak emas' }).expect(403);
      expect(res.body.error.code).toBe('TRANSITION_FORBIDDEN_ROLE');
    });

    it('optimistic lock: eskirgan versiya bilan o\'tish rad etiladi', async () => {
      await fillCart();
      const o = await create(pickup()).expect(201);
      const sm = ctx.app.get(OrderStateMachine);
      const order = await ctx.prisma.order.findUniqueOrThrow({ where: { id: o.body.id } });
      // Kimdir orada o'zgartirdi
      await ctx.prisma.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
      await expect(
        ctx.prisma.$transaction((tx) =>
          sm.transition(tx, order, 'CANCELLED', { id: customer.user.id, role: 'CUSTOMER' }, { comment: 'x' }),
        ),
      ).rejects.toMatchObject({ code: 'ORDER_CONFLICT' });
    });
  });

  describe('qayta buyurtma', () => {
    it('savatga qo\'shadi, narx farqini ko\'rsatadi, sotilmayotganini o\'tkazib yuboradi', async () => {
      await fillCart();
      const o = await create(pickup()).expect(201);
      // Guruh narxi qimmatladi — endi 10+ list pog'onasi (385 000) arzonroq
      await ctx.prisma.variantGroupPrice.updateMany({ data: { price: 390_000n } });
      await ctx.prisma.productVariant.update({ where: { id: c.hingeV.id }, data: { isActive: false } });

      const res = await ctx.http.post(`/api/v1/cart/reorder/${o.body.id}`).set(auth).expect(200);
      expect(res.body.added).toEqual([{ sku: 'KR-W980-16', qty: '12', oldUnitPrice: 380_000, newUnitPrice: 385_000 }]);
      expect(res.body.skipped).toEqual([{ sku: 'GTV-PB-110', reason: 'INACTIVE' }]);
      expect(res.body.cart.count).toBe(1);
    });

    it('boshqaning buyurtmasi — 404', async () => {
      await fillCart();
      const o = await create(pickup()).expect(201);
      const other = (await userWithToken(ctx, 'CUSTOMER')).auth;
      await ctx.http.post(`/api/v1/cart/reorder/${o.body.id}`).set(other).expect(404);
    });
  });
});
