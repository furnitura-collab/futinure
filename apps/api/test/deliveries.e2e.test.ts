import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OutboxDispatcher } from '../src/events/outbox.dispatcher.js';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedAddress, seedCatalog, seedWarehouse, userWithToken } from './fixtures.js';

type Auth = Record<string, string>;
type User = Awaited<ReturnType<typeof userWithToken>>;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('yetkazish va haydovchi (e2e)', () => {
  let ctx: TestContext;
  let c: Awaited<ReturnType<typeof seedCatalog>>;
  let customer: User;
  let driver: User;
  let otherDriver: User;
  let manager: Auth;
  let addressId: string;
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
    driver = await userWithToken(ctx, 'DRIVER');
    otherDriver = await userWithToken(ctx, 'DRIVER');
    manager = (await userWithToken(ctx, 'MANAGER')).auth;
    addressId = (await seedAddress(ctx, customer.user.id)).id;
    warehouseId = (await seedWarehouse(ctx)).id;
  });

  // ───── yordamchilar ─────

  /** 2 ta oq LDSP (2 × 395 000), yetkazish, menejer tasdiqlagan */
  async function order(terms: object = { paymentTerms: 'ON_DELIVERY' }, deliveryType: 'DELIVERY' | 'PICKUP' = 'DELIVERY') {
    await ctx.http.put(`/api/v1/cart/items/${c.white.id}`).set(customer.auth).send({ qty: 2 }).expect(200);
    const res = await ctx.http
      .post('/api/v1/orders')
      .set(customer.auth)
      .set('Idempotency-Key', randomUUID())
      .send(deliveryType === 'DELIVERY' ? { deliveryType, addressId, deliveryDate: '2026-11-10' } : { deliveryType, warehouseId })
      .expect(201);
    const id = res.body.id as string;
    await go(id, { to: 'CONFIRMED', terms: { allowedMethods: ['CASH'], deliveryFee: 50_000, ...terms } }).expect(200);
    return id;
  }
  const go = (id: string, body: object, auth: Auth = manager) =>
    ctx.http.post(`/api/v1/admin/orders/${id}/transition`).set(auth).send(body);
  const assign = (id: string, body: object) => ctx.http.put(`/api/v1/admin/orders/${id}/delivery`).set(manager).send(body);
  async function ready(id: string) {
    await go(id, { to: 'PREPARING' }).expect(200);
    await go(id, { to: 'READY' }).expect(200);
  }
  const driverApi = (path: string, who: User = driver) => ctx.http.post(`/api/v1/driver/deliveries/${path}`).set(who.auth);
  async function proof(who: User = driver) {
    const res = await ctx.http.post('/api/v1/driver/uploads/proof').set(who.auth).attach('file', PNG, 'foto.png').expect(201);
    return res.body.id as string;
  }
  const stock = async () => (await ctx.prisma.productVariant.findUniqueOrThrow({ where: { id: c.white.id } })).stockQty.toString();
  const drain = () => ctx.app.get(OutboxDispatcher).drain();

  // ───── biriktirish ─────

  describe('haydovchi biriktirish', () => {
    it('menejer biriktiradi; sana buyurtmadan olinadi; detail\'da ko\'rinadi', async () => {
      const id = await order();
      const res = await assign(id, { driverId: driver.user.id }).expect(200);
      expect(res.body.delivery).toMatchObject({
        driverId: driver.user.id,
        status: 'ASSIGNED',
        scheduledDate: '2026-11-10T00:00:00.000Z',
        driver: { id: driver.user.id },
      });

      const drivers = await ctx.http.get('/api/v1/admin/drivers').set(manager).expect(200);
      expect(drivers.body.find((d: { id: string }) => d.id === driver.user.id)._count.deliveries).toBe(1);
    });

    it('olib ketish, haydovchi bo\'lmagan foydalanuvchi va mijoz — rad', async () => {
      const pickup = await order({ paymentTerms: 'ON_DELIVERY' }, 'PICKUP');
      expect((await assign(pickup, { driverId: driver.user.id }).expect(422)).body.error.code).toBe('NOT_A_DELIVERY');

      const id = await order();
      expect((await assign(id, { driverId: customer.user.id }).expect(422)).body.error.code).toBe('NOT_A_DRIVER');
      await ctx.http.put(`/api/v1/admin/orders/${id}/delivery`).set(driver.auth).send({ driverId: driver.user.id }).expect(403);
    });

    it('yo\'lga chiqqandan keyin almashtirib bo\'lmaydi', async () => {
      const id = await order();
      await assign(id, { driverId: driver.user.id }).expect(200);
      await ready(id);
      await driverApi(`${id}/start`).send({}).expect(200);
      expect((await assign(id, { driverId: otherDriver.user.id }).expect(409)).body.error.code).toBe('DELIVERY_LOCKED');
    });

    it('haydovchiga push/bildirishnoma; eski haydovchi ro\'yxatidan chiqadi', async () => {
      const id = await order();
      await assign(id, { driverId: driver.user.id }).expect(200);
      await assign(id, { driverId: otherDriver.user.id }).expect(200);
      await drain();

      const notes = await ctx.prisma.notification.findMany({ where: { type: 'delivery.assigned' }, orderBy: { createdAt: 'asc' } });
      expect(notes.map((n) => n.userId)).toEqual([driver.user.id, otherDriver.user.id]);
      expect(notes[0]!.body).toContain('Chilonzor');

      const mine = await ctx.http.get('/api/v1/driver/deliveries').set(driver.auth).expect(200);
      expect(mine.body.active).toHaveLength(0);
      const theirs = await ctx.http.get('/api/v1/driver/deliveries').set(otherDriver.auth).expect(200);
      expect(theirs.body.active).toHaveLength(1);
    });
  });

  // ───── haydovchi ─────

  describe('haydovchi ilovasi', () => {
    it('faqat o\'z yetkazishlarini ko\'radi va o\'zgartiradi', async () => {
      const id = await order();
      await assign(id, { driverId: driver.user.id }).expect(200);
      await ready(id);

      const list = await ctx.http.get('/api/v1/driver/deliveries').set(driver.auth).expect(200);
      expect(list.body.active).toHaveLength(1);
      expect(list.body.active[0].order).toMatchObject({
        status: 'READY',
        itemsCount: 1,
        toCollect: 2 * 395_000 + 50_000,
        addressSnapshot: { addressText: 'Toshkent, Chilonzor 5-kvartal' },
      });
      // Narxlar haydovchiga ko'rinmaydi
      expect(list.body.active[0].order.grandTotal).toBeUndefined();

      await ctx.http.get(`/api/v1/driver/deliveries/${id}`).set(otherDriver.auth).expect(404);
      await driverApi(`${id}/start`, otherDriver).send({}).expect(404);
      // Umumiy transition endpointi ham boshqa haydovchiga yopiq
      await go(id, { to: 'OUT_FOR_DELIVERY' }, otherDriver.auth).expect(404);
      await ctx.http.get('/api/v1/driver/deliveries').set(customer.auth).expect(403);
    });

    it('tayyor bo\'lmagan buyurtma bilan yo\'lga chiqib bo\'lmaydi', async () => {
      const id = await order();
      await assign(id, { driverId: driver.user.id }).expect(200);
      const res = await driverApi(`${id}/start`).send({}).expect(409);
      expect(res.body.error.code).toBe('TRANSITION_NO_SUCH_TRANSITION');
    });

    it('to\'liq oqim: yo\'lga chiqdim → surat + naqd bilan topshirdim → kassa tasdig\'i → yakunlandi', async () => {
      const id = await order();
      await assign(id, { driverId: driver.user.id }).expect(200);
      await ready(id);

      const started = await driverApi(`${id}/start`).send({}).expect(200);
      expect(started.body).toMatchObject({ status: 'IN_TRANSIT', order: { status: 'OUT_FOR_DELIVERY' } });
      expect(await stock()).toBe('118');

      const photo = await proof();
      const due = 2 * 395_000 + 50_000;
      const done = await driverApi(`${id}/deliver`).send({ receiverName: 'Aziz aka', proofUploadId: photo, cashCollected: due }).expect(200);
      expect(done.body).toMatchObject({
        status: 'DELIVERED',
        receiverName: 'Aziz aka',
        cashCollected: due,
        proofUploadId: photo,
        order: { status: 'DELIVERED', toCollect: 0 },
      });

      // Naqd pul haydovchida — kassaga topshirilguncha PENDING
      const payment = await ctx.prisma.payment.findFirstOrThrow({ where: { orderId: id } });
      expect(payment).toMatchObject({ method: 'CASH', status: 'PENDING', amount: BigInt(due), createdBy: driver.user.id });
      const history = await ctx.prisma.orderStatusHistory.findFirstOrThrow({ where: { orderId: id, toStatus: 'DELIVERED' } });
      expect(history.comment).toBe('Qabul qildi: Aziz aka');

      // Surat: menejer ko'radi, boshqa haydovchi — yo'q
      const file = await ctx.http.get(`/api/v1/admin/orders/${id}/delivery/proof`).set(manager).expect(200);
      expect(file.headers['content-type']).toBe('image/png');
      await ctx.http.get(`/api/v1/admin/orders/${id}/delivery/proof`).set(otherDriver.auth).expect(404);

      // Bugun topshirilganlar ro'yxatida
      const list = await ctx.http.get('/api/v1/driver/deliveries').set(driver.auth).expect(200);
      expect(list.body.active).toHaveLength(0);
      expect(list.body.done).toHaveLength(1);

      await ctx.http.post(`/api/v1/admin/payments/${payment.id}/confirm`).set(manager).expect(200);
      expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
    });

    it('ortiqcha naqd — rad, hech narsa o\'zgarmaydi (bitta tranzaksiya)', async () => {
      const id = await order();
      await assign(id, { driverId: driver.user.id }).expect(200);
      await ready(id);
      await driverApi(`${id}/start`).send({}).expect(200);

      const res = await driverApi(`${id}/deliver`).send({ receiverName: 'Aziz', cashCollected: 10_000_000 }).expect(422);
      expect(res.body.error.code).toBe('AMOUNT_EXCEEDS_DUE');
      const o = await ctx.prisma.order.findUniqueOrThrow({ where: { id }, include: { delivery: true } });
      expect(o.status).toBe('OUT_FOR_DELIVERY');
      expect(o.delivery!.status).toBe('IN_TRANSIT');
      expect(await ctx.prisma.ledgerEntry.count()).toBe(0);
    });

    it('surat faqat o\'ziniki va bir marta', async () => {
      const a = await order();
      const b = await order();
      for (const id of [a, b]) {
        await assign(id, { driverId: driver.user.id }).expect(200);
        await ready(id);
        await driverApi(`${id}/start`).send({}).expect(200);
      }
      const foreign = await proof(otherDriver);
      await driverApi(`${a}/deliver`).send({ receiverName: 'Aziz', proofUploadId: foreign }).expect(404);

      const photo = await proof();
      await driverApi(`${a}/deliver`).send({ receiverName: 'Aziz', proofUploadId: photo }).expect(200);
      const res = await driverApi(`${b}/deliver`).send({ receiverName: 'Aziz', proofUploadId: photo }).expect(409);
      expect(res.body.error.code).toBe('PROOF_ALREADY_USED');
    });

    it('yetkazib bo\'lmadi: omborga qaytadi, mijoz va xodimlar xabar oladi, qayta biriktirish mumkin', async () => {
      const id = await order();
      await assign(id, { driverId: driver.user.id }).expect(200);
      await ready(id);
      await driverApi(`${id}/start`).send({}).expect(200);
      await driverApi(`${id}/fail`).send({ reason: 'x' }).expect(422);

      const res = await driverApi(`${id}/fail`).send({ reason: 'Telefonni ko\'tarmadi' }).expect(200);
      expect(res.body).toMatchObject({ status: 'FAILED', failReason: 'Telefonni ko\'tarmadi', order: { status: 'READY' } });
      expect(await stock()).toBe('120');

      await drain();
      const note = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: customer.user.id, type: 'order.delivery_failed' } });
      expect(note.title).toBe('Yetkazib bo\'lmadi');
      expect(note.body).toContain('Telefonni ko\'tarmadi');
      expect(ctx.telegram.messages.some((m) => m.includes('Yetkazilmadi'))).toBe(true);

      // Faol ro'yxatda qoladi; qayta biriktirilsa yangi urinish
      const list = await ctx.http.get('/api/v1/driver/deliveries').set(driver.auth).expect(200);
      expect(list.body.active[0].status).toBe('FAILED');
      const again = await assign(id, { driverId: driver.user.id, scheduledDate: '2026-11-11' }).expect(200);
      expect(again.body.delivery).toMatchObject({ status: 'ASSIGNED', scheduledDate: '2026-11-11T00:00:00.000Z' });
    });

    it('nasiyada pul olinmaydi', async () => {
      await ctx.prisma.customerProfile.update({ where: { userId: customer.user.id }, data: { creditLimit: 5_000_000n } });
      const id = await order({ paymentTerms: 'CREDIT' });
      await assign(id, { driverId: driver.user.id }).expect(200);
      const res = await ctx.http.get(`/api/v1/driver/deliveries/${id}`).set(driver.auth).expect(200);
      expect(res.body.order.toCollect).toBe(0);
      expect(res.body.order.items).toHaveLength(1);
    });
  });
});
