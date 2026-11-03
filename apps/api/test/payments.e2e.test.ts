import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedCatalog, seedWarehouse, userWithToken } from './fixtures.js';

type Auth = Record<string, string>;

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('to\'lovlar va mijoz moliyasi (e2e)', () => {
  let ctx: TestContext;
  let c: Awaited<ReturnType<typeof seedCatalog>>;
  let customer: Awaited<ReturnType<typeof userWithToken>>;
  let manager: Auth;
  let admin: Auth;
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
    warehouseId = (await seedWarehouse(ctx)).id;
    await ctx.prisma.setting.create({ data: { key: 'payment.card', value: { number: '8600 1234', holder: 'MEBEL' } } });
  });

  // ───── yordamchilar ─────

  async function order(lines: [string, number][], terms: object, who = customer) {
    for (const [variantId, qty] of lines) {
      await ctx.http.put(`/api/v1/cart/items/${variantId}`).set(who.auth).send({ qty }).expect(200);
    }
    const res = await ctx.http
      .post('/api/v1/orders')
      .set(who.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ deliveryType: 'PICKUP', warehouseId })
      .expect(201);
    if (Object.keys(terms).length) {
      await go(res.body.id, { to: 'CONFIRMED', terms: { allowedMethods: ['CASH', 'CARD_TRANSFER'], ...terms } }).expect(200);
    }
    return res.body.id as string;
  }
  const go = (id: string, body: object, auth: Auth = manager) =>
    ctx.http.post(`/api/v1/admin/orders/${id}/transition`).set(auth).send(body);
  async function deliver(id: string) {
    await go(id, { to: 'PREPARING', overrideCreditLimit: true, comment: 'test' }).expect(200);
    await go(id, { to: 'READY' }).expect(200);
    return go(id, { to: 'DELIVERED', receiverName: 'Aziz' }).expect(200);
  }
  async function receipt(auth: Auth = customer.auth) {
    const res = await ctx.http.post('/api/v1/uploads/receipts').set(auth).attach('file', PNG, 'chek.png').expect(201);
    return res.body.id as string;
  }
  const report = async (orderId: string, amount: number, extra: object = {}) =>
    ctx.http
      .post(`/api/v1/orders/${orderId}/payments`)
      .set(customer.auth)
      .send({ amount, method: 'CARD_TRANSFER', receiptUploadId: await receipt(), ...extra });
  /** report() async (avval chek yuklaydi) — supertest .expect() o'rniga shu */
  const expectStatus = async (res: Promise<{ status: number; body: any }>, status: number) => {
    const r = await res;
    expect(r.status, JSON.stringify(r.body)).toBe(status);
    return r;
  };
  const confirm = (id: string, auth: Auth = manager) => ctx.http.post(`/api/v1/admin/payments/${id}/confirm`).set(auth);
  const profile = () => ctx.prisma.customerProfile.findUniqueOrThrow({ where: { userId: customer.user.id } });
  const getOrder = (id: string) => ctx.prisma.order.findUniqueOrThrow({ where: { id } });

  // ───── testlar ─────

  it('to\'lov ma\'lumotlari ochiq', async () => {
    const res = await ctx.http.get('/api/v1/payment-info').expect(200);
    expect(res.body).toEqual({ card: { number: '8600 1234', holder: 'MEBEL' }, bank: null });
  });

  describe('chek yuklash', () => {
    it('rasm qabul qilinadi, matn rad etiladi, xodim yuklamaydi', async () => {
      const res = await ctx.http.post('/api/v1/uploads/receipts').set(customer.auth).attach('file', PNG, 'chek.png').expect(201);
      expect(res.body).toMatchObject({ mimeType: 'image/png' });
      await ctx.http.post('/api/v1/uploads/receipts').set(customer.auth).attach('file', Buffer.from('salom dunyo salom'), 'x.pdf').expect(415);
      await ctx.http.post('/api/v1/uploads/receipts').set(manager).attach('file', PNG, 'x.png').expect(403);
    });

    it('PDF chek ham qabul qilinadi', async () => {
      const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
      const res = await ctx.http.post('/api/v1/uploads/receipts').set(customer.auth).attach('file', pdf, 'chek.pdf').expect(201);
      expect(res.body.mimeType).toBe('application/pdf');
    });
  });

  describe('buyurtma uchun to\'lov (chek bilan)', () => {
    it('tasdiqlanmagan buyurtmaga to\'lab bo\'lmaydi', async () => {
      const id = await order([[c.white.id, 12]], {});
      expect((await expectStatus(report(id, 1000), 409)).body.error.code).toBe('ORDER_NOT_PAYABLE');
    });

    it('kelishilmagan usul — 422', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ON_DELIVERY', allowedMethods: ['CASH'] });
      expect((await expectStatus(report(id, 1000), 422)).body.error.code).toBe('METHOD_NOT_ALLOWED');
    });

    it('qoldiqdan ko\'p — 422, kutilayotgan to\'lovlar ham hisobga olinadi', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ON_DELIVERY' });
      expect((await expectStatus(report(id, 4_620_001), 422)).body.error).toMatchObject({ code: 'AMOUNT_EXCEEDS_DUE', details: { due: 4_620_000 } });
      await expectStatus(report(id, 4_000_000), 201);
      expect((await expectStatus(report(id, 1_000_000), 422)).body.error.details.due).toBe(620_000);
    });

    it('boshqaning cheki — 404, bir chek ikki marta — 409', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ON_DELIVERY' });
      const other = await userWithToken(ctx, 'CUSTOMER');
      const foreign = await receipt(other.auth);
      await expectStatus(report(id, 1000, { receiptUploadId: foreign }), 404);
      const mine = await receipt();
      await expectStatus(report(id, 1000, { receiptUploadId: mine }), 201);
      expect((await expectStatus(report(id, 1000, { receiptUploadId: mine }), 409)).body.error.code).toBe('RECEIPT_ALREADY_USED');
    });

    it('avans: mijoz yuboradi → menejer tasdiqlaydi → daftar, buyurtma, ishlab chiqarishga o\'tadi', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ADVANCE', advanceAmount: 1_000_000 });
      const p = await expectStatus(report(id, 1_000_000), 201);
      expect(p.body).toMatchObject({ status: 'PENDING', amount: 1_000_000, receipt: { mimeType: 'image/png' } });
      await go(id, { to: 'PREPARING' }).expect(409);

      const queue = await ctx.http.get('/api/v1/admin/payments?status=PENDING').set(manager).expect(200);
      expect(queue.body.items.map((x: { id: string }) => x.id)).toEqual([p.body.id]);
      expect((await ctx.http.get('/api/v1/me/balance').set(customer.auth)).body.pendingPayments).toBe(1_000_000);

      const ok = await confirm(p.body.id).expect(200);
      expect(ok.body).toMatchObject({ status: 'CONFIRMED', order: { paidTotal: 1_000_000 } });

      const ledger = await ctx.prisma.ledgerEntry.findMany({ where: { customerId: customer.user.id } });
      expect(ledger).toEqual([expect.objectContaining({ type: 'CREDIT', amount: -1_000_000n, balanceAfter: -1_000_000n, paymentId: p.body.id })]);
      expect((await profile()).balanceCached).toBe(-1_000_000n);
      await go(id, { to: 'PREPARING' }).expect(200);
    });

    it('ikki marta tasdiqlab bo\'lmaydi, parallel ham', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ON_DELIVERY' });
      const p = await expectStatus(report(id, 500_000), 201);
      const [a, b] = await Promise.all([confirm(p.body.id), confirm(p.body.id, admin)]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await ctx.prisma.ledgerEntry.count()).toBe(1);
      expect((await getOrder(id)).paidTotal).toBe(500_000n);
    });

    it('rad etish — daftarga tushmaydi, sabab saqlanadi', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ON_DELIVERY' });
      const p = await expectStatus(report(id, 500_000), 201);
      await ctx.http.post(`/api/v1/admin/payments/${p.body.id}/reject`).set(manager).send({ reason: '' }).expect(422);
      const res = await ctx.http
        .post(`/api/v1/admin/payments/${p.body.id}/reject`)
        .set(manager)
        .send({ reason: 'Chekda summa boshqa' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Chekda summa boshqa' });
      expect(await ctx.prisma.ledgerEntry.count()).toBe(0);
      await confirm(p.body.id).expect(409);
    });

    it('chekni egasi va menejer ko\'radi, boshqalar yo\'q; statik yo\'l yopiq', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ON_DELIVERY' });
      const p = await expectStatus(report(id, 500_000), 201);
      const url = `/api/v1/payments/${p.body.id}/receipt`;
      const own = await ctx.http.get(url).set(customer.auth).expect(200).expect('Content-Type', 'image/png');
      expect(Buffer.compare(own.body as Buffer, PNG)).toBe(0);
      await ctx.http.get(url).set(manager).expect(200);
      await ctx.http.get(url).set((await userWithToken(ctx, 'CUSTOMER')).auth).expect(404);
      await ctx.http.get(url).set((await userWithToken(ctx, 'WAREHOUSE')).auth).expect(403);

      const upload = await ctx.prisma.upload.findFirstOrThrow();
      await ctx.http.get(`/uploads/private/${upload.storagePath}`).expect(404);
    });

    it('kutilayotgan to\'lovlar soni cheklangan', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ON_DELIVERY' });
      for (let i = 0; i < 5; i++) await expectStatus(report(id, 1000), 201);
      expect((await expectStatus(report(id, 1000), 429)).body.error.code).toBe('TOO_MANY_PENDING');
    });
  });

  describe('menejer kiritgan to\'lov va yakunlash', () => {
    it('topshirishda naqd olindi → buyurtma COMPLETED, balans 0', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ON_DELIVERY' });
      const delivered = await deliver(id);
      expect(delivered.body.status).toBe('DELIVERED');
      expect((await profile()).balanceCached).toBe(4_620_000n);

      const res = await ctx.http
        .post('/api/v1/admin/payments')
        .set(manager)
        .send({ customerId: customer.user.id, orderId: id, amount: 4_620_000, method: 'CASH', comment: 'Ombordan olib ketishda' })
        .expect(201);
      expect(res.body).toMatchObject({ status: 'CONFIRMED', method: 'CASH' });
      expect((await getOrder(id)).status).toBe('COMPLETED');
      expect((await profile()).balanceCached).toBe(0n);
    });

    it('boshqa mijozning buyurtmasiga — 422', async () => {
      const id = await order([[c.white.id, 1]], { paymentTerms: 'ON_DELIVERY' });
      const other = await userWithToken(ctx, 'CUSTOMER');
      await ctx.http
        .post('/api/v1/admin/payments')
        .set(manager)
        .send({ customerId: other.user.id, orderId: id, amount: 1000, method: 'CASH' })
        .expect(422);
    });
  });

  describe('nasiya: umumiy qarz, FIFO, muddati o\'tgan, akt-sverka', () => {
    beforeEach(async () => {
      await ctx.prisma.customerProfile.update({
        where: { userId: customer.user.id },
        data: { creditLimit: 50_000_000n, paymentTermDays: 10, allowedPaymentMethods: ['CASH', 'CARD_TRANSFER'] },
      });
    });

    async function twoCreditOrders() {
      const a = await order([[c.white.id, 12]], { paymentTerms: 'CREDIT' });
      await deliver(a);
      const b = await order([[c.hingeV.id, 2]], { paymentTerms: 'CREDIT' });
      await deliver(b);
      return { a, b };
    }

    it('nasiyaga topshirilgan buyurtmalar — balans va limit', async () => {
      await twoCreditOrders();
      const res = await ctx.http.get('/api/v1/me/balance').set(customer.auth).expect(200);
      expect(res.body).toMatchObject({ balance: 4_648_000, creditLimit: 50_000_000, availableCredit: 45_352_000, overdueAmount: 0 });
    });

    it('umumiy qarzga to\'lov eng eski buyurtmalardan yopiladi (FIFO)', async () => {
      const { a, b } = await twoCreditOrders();
      const tooMuch = await ctx.http
        .post('/api/v1/me/payments')
        .set(customer.auth)
        .send({ amount: 5_000_000, method: 'CARD_TRANSFER', receiptUploadId: await receipt() })
        .expect(422);
      expect(tooMuch.body.error.details.due).toBe(4_648_000);

      const p = await ctx.http
        .post('/api/v1/me/payments')
        .set(customer.auth)
        .send({ amount: 4_630_000, method: 'CARD_TRANSFER', receiptUploadId: await receipt() })
        .expect(201);
      expect(p.body.orderId).toBeNull();
      await confirm(p.body.id).expect(200);

      expect((await getOrder(a)).paidTotal).toBe(4_620_000n);
      expect((await getOrder(b)).paidTotal).toBe(10_000n);
      expect((await profile()).balanceCached).toBe(18_000n);
    });

    it('muddati o\'tgan qarz va debitorlik hisoboti', async () => {
      const { b } = await twoCreditOrders();
      await ctx.prisma.order.update({ where: { id: b }, data: { dueDate: new Date('2020-01-01') } });

      expect((await ctx.http.get('/api/v1/me/balance').set(customer.auth)).body.overdueAmount).toBe(28_000);
      const overdue = await ctx.http.get('/api/v1/admin/customers?overdue=true').set(manager).expect(200);
      expect(overdue.body.items.map((u: { id: string }) => u.id)).toEqual([customer.user.id]);

      const rep = await ctx.http.get('/api/v1/admin/reports/receivables').set(manager).expect(200);
      expect(rep.body).toMatchObject({ totalReceivable: 4_648_000, totalOverdue: 28_000 });
      expect(rep.body.customers[0]).toMatchObject({ customer_id: customer.user.id, overdue: 28_000 });
    });

    it('akt-sverka: boshlang\'ich + debet − kredit = yakuniy = balans', async () => {
      await twoCreditOrders();
      await ctx.http
        .post('/api/v1/admin/payments')
        .set(manager)
        .send({ customerId: customer.user.id, amount: 100_000, method: 'CASH' })
        .expect(201);
      const res = await ctx.http.get('/api/v1/me/reconciliation').set(customer.auth).expect(200);
      expect(res.body).toMatchObject({ openingBalance: 0, totalDebit: 4_648_000, totalCredit: 100_000, closingBalance: 4_548_000 });
      expect(res.body.entries.map((e: { type: string }) => e.type)).toEqual(['DEBIT', 'DEBIT', 'CREDIT']);
      expect(res.body.entries.at(-1).balanceAfter).toBe(4_548_000);

      const future = await ctx.http.get('/api/v1/me/reconciliation?from=2099-01-01&to=2099-01-31').set(customer.auth).expect(200);
      expect(future.body).toMatchObject({ openingBalance: 4_548_000, closingBalance: 4_548_000, entries: [] });
      await ctx.http.get('/api/v1/me/reconciliation?from=2026-02-01&to=2026-01-01').set(customer.auth).expect(422);
    });
  });

  describe('pul qaytarish va tuzatish', () => {
    it('bekor qilingan buyurtma avansi: mijoz haqdor → qaytariladi (faqat super admin)', async () => {
      const id = await order([[c.white.id, 12]], { paymentTerms: 'ADVANCE', advanceAmount: 1_000_000 });
      const p = await expectStatus(report(id, 1_000_000), 201);
      await confirm(p.body.id).expect(200);
      await go(id, { to: 'CANCELLED', comment: 'Mijoz voz kechdi' }).expect(200);
      expect((await profile()).balanceCached).toBe(-1_000_000n);

      const url = `/api/v1/admin/customers/${customer.user.id}/refunds`;
      const body = { amount: 1_000_000, method: 'CASH', description: 'Avans qaytarildi' };
      await ctx.http.post(url).set(manager).send(body).expect(403);
      expect((await ctx.http.post(url).set(admin).send({ ...body, amount: 1_500_000 }).expect(422)).body.error.details.available).toBe(1_000_000);
      await ctx.http.post(url).set(admin).send(body).expect(201);
      expect((await profile()).balanceCached).toBe(0n);
    });

    it('qo\'lda tuzatish — eski qarzni kiritish', async () => {
      const res = await ctx.http
        .post(`/api/v1/admin/customers/${customer.user.id}/ledger/adjust`)
        .set(admin)
        .send({ amount: 2_500_000, description: 'Eski daftardan ko\'chirilgan qarz' })
        .expect(201);
      expect(res.body).toMatchObject({ type: 'ADJUSTMENT', amount: 2_500_000, balanceAfter: 2_500_000 });
      const ledger = await ctx.http.get('/api/v1/me/ledger').set(customer.auth).expect(200);
      expect(ledger.body.total).toBe(1);
    });
  });

  describe('admin: mijozlar', () => {
    it('menejer guruhni o\'zgartiradi, limitni faqat super admin', async () => {
      const url = `/api/v1/admin/customers/${customer.user.id}`;
      const res = await ctx.http.patch(url).set(manager).send({ priceGroupId: c.usta.id, type: 'MASTER' }).expect(200);
      expect(res.body.customerProfile).toMatchObject({ type: 'MASTER', priceGroup: { name: 'Usta' } });
      await ctx.http.patch(url).set(manager).send({ creditLimit: 5_000_000 }).expect(403);
      const ok = await ctx.http.patch(url).set(admin).send({ creditLimit: 5_000_000, paymentTermDays: 15 }).expect(200);
      expect(ok.body.finance).toMatchObject({ creditLimit: 5_000_000, paymentTermDays: 15 });
    });

    it('bloklash sessiyalarni yopadi', async () => {
      const login = await ctx.app.get((await import('../src/auth/token.service.js')).TokenService).issue(customer.user);
      await ctx.http.patch(`/api/v1/admin/customers/${customer.user.id}`).set(manager).send({ isActive: false }).expect(200);
      await ctx.http.post('/api/v1/auth/refresh').send({ refreshToken: login.refreshToken }).expect(401);
    });

    it('qidiruv va qarzdorlar filtri', async () => {
      await ctx.prisma.customerProfile.update({ where: { userId: customer.user.id }, data: { companyName: 'Aziz Mebel MChJ', balanceCached: 100n } });
      expect((await ctx.http.get('/api/v1/admin/customers?q=aziz').set(manager)).body.total).toBe(1);
      expect((await ctx.http.get('/api/v1/admin/customers?debtors=true').set(manager)).body.total).toBe(1);
      const detail = await ctx.http.get(`/api/v1/admin/customers/${customer.user.id}`).set(manager).expect(200);
      expect(detail.body).toMatchObject({ finance: { balance: 100 }, stats: { orders: 0 } });
    });
  });
});
