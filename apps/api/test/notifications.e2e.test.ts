import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RT } from '@mebel/shared';
import { OutboxDispatcher } from '../src/events/outbox.dispatcher.js';
import { DebtReminderScheduler } from '../src/notifications/debt-reminder.scheduler.js';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedCatalog, seedWarehouse, userWithToken } from './fixtures.js';

type Auth = Record<string, string>;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('xabarlar: outbox, bildirishnoma, push, Telegram, socket, chat (e2e)', () => {
  let ctx: TestContext;
  let c: Awaited<ReturnType<typeof seedCatalog>>;
  let customer: Awaited<ReturnType<typeof userWithToken>>;
  let managerUser: Awaited<ReturnType<typeof userWithToken>>;
  let manager: Auth;
  let warehouseId: string;
  let drain: () => Promise<number>;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    const dispatcher = ctx.app.get(OutboxDispatcher);
    drain = () => dispatcher.drain();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    c = await seedCatalog(ctx);
    customer = await userWithToken(ctx, 'CUSTOMER');
    managerUser = await userWithToken(ctx, 'MANAGER');
    manager = managerUser.auth;
    warehouseId = (await seedWarehouse(ctx)).id;
    await ctx.prisma.deviceToken.create({ data: { userId: customer.user.id, token: 'ExponentPushToken[mijoz]', platform: 'ios' } });
  });
  afterEach(() => {
    for (const s of sockets.splice(0)) s.disconnect();
  });

  // ───── yordamchilar ─────

  async function placeOrder(qty = 12) {
    await ctx.http.put(`/api/v1/cart/items/${c.white.id}`).set(customer.auth).send({ qty }).expect(200);
    const res = await ctx.http
      .post('/api/v1/orders')
      .set(customer.auth)
      .set('Idempotency-Key', randomUUID())
      .send({ deliveryType: 'PICKUP', warehouseId })
      .expect(201);
    return res.body as { id: string; number: string };
  }
  const go = (id: string, body: object) => ctx.http.post(`/api/v1/admin/orders/${id}/transition`).set(manager).send(body);
  const terms = { paymentTerms: 'ON_DELIVERY', allowedMethods: ['CASH', 'CARD_TRANSFER'] };
  const notifications = (userId = customer.user.id) =>
    ctx.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });

  function connect(token?: string): Promise<Socket> {
    const { port } = ctx.app.getHttpServer().address() as AddressInfo;
    const socket = io(`http://127.0.0.1:${port}/rt`, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
    sockets.push(socket);
    return new Promise((resolve, reject) => {
      socket.once('ready', () => resolve(socket));
      socket.once('disconnect', () => reject(new Error('disconnected')));
      setTimeout(() => reject(new Error('timeout')), 3000);
    });
  }
  function next<T = any>(socket: Socket, event: string, ms = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${event} kelmadi`)), ms);
      socket.once(event, (data: T) => {
        clearTimeout(t);
        resolve(data);
      });
    });
  }
  const token = (auth: Auth) => auth.Authorization!.slice(7);

  // ───── testlar ─────

  describe('outbox', () => {
    it('yangi buyurtma: hodisa yoziladi, Telegram\'ga ketadi', async () => {
      const o = await placeOrder();
      const events = await ctx.prisma.outboxEvent.findMany();
      expect(events.map((e) => e.type)).toEqual(['order.created']);
      expect(await drain()).toBe(1);
      expect(ctx.telegram.messages).toHaveLength(1);
      expect(ctx.telegram.messages[0]).toContain(o.number);
      expect(ctx.telegram.messages[0]).toContain('4 620 000 so\'m');
      expect((await ctx.prisma.outboxEvent.findFirstOrThrow()).processedAt).not.toBeNull();
    });

    it('bekor bo\'lgan tranzaksiya hodisa qoldirmaydi', async () => {
      const o = await placeOrder(130); // omborda 120
      await drain();
      await go(o.id, { to: 'CONFIRMED', terms }).expect(409);
      expect(await ctx.prisma.outboxEvent.count({ where: { processedAt: null } })).toBe(0);
    });

    it('handler xatosi — keyinroq qayta urinadi', async () => {
      const o = await placeOrder();
      // Hodisa qayta ishlanguncha buyurtma yo'qolsa — handler yiqiladi
      await ctx.prisma.order.update({ where: { id: o.id }, data: { number: o.number } });
      await ctx.prisma.$executeRawUnsafe(`UPDATE outbox_events SET payload = '{"orderId":"01900000-0000-7000-8000-000000000000"}'`);
      await drain();
      const e = await ctx.prisma.outboxEvent.findFirstOrThrow();
      expect(e).toMatchObject({ attempts: 1, processedAt: null });
      expect(e.lastError).toBeTruthy();
      expect(e.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('takroriy qayta ishlash dublikat bildirishnoma va push bermaydi', async () => {
      const o = await placeOrder();
      await go(o.id, { to: 'CONFIRMED', terms }).expect(200);
      await drain();
      expect(await notifications()).toHaveLength(1);
      expect(ctx.push.sent).toHaveLength(1);

      await ctx.prisma.outboxEvent.updateMany({ data: { processedAt: null } });
      await drain();
      expect(await notifications()).toHaveLength(1);
      expect(ctx.push.sent).toHaveLength(1);
    });
  });

  describe('mijozga bildirishnoma', () => {
    it('menejer tasdiqladi → bildirishnoma + push', async () => {
      const o = await placeOrder();
      await go(o.id, { to: 'CONFIRMED', terms }).expect(200);
      await drain();
      const [n] = await notifications();
      expect(n).toMatchObject({ type: 'order.confirmed', title: 'Buyurtma tasdiqlandi', payload: { orderId: o.id } });
      expect(n!.body).toBe(`${o.number} tasdiqlandi. Jami: 4 620 000 so'm`);
      expect(ctx.push.sent[0]).toMatchObject({ to: 'ExponentPushToken[mijoz]', title: 'Buyurtma tasdiqlandi' });
    });

    it('rus tilidagi mijozga — ruscha', async () => {
      await ctx.prisma.user.update({ where: { id: customer.user.id }, data: { locale: 'ru' } });
      const o = await placeOrder();
      await go(o.id, { to: 'CONFIRMED', terms }).expect(200);
      await drain();
      expect((await notifications())[0]).toMatchObject({ title: 'Заказ подтверждён', body: `${o.number} подтверждён. Итого: 4 620 000 сум` });
    });

    it('taklif: bitta "yangi taklif" xabari (QUOTED statusi alohida xabar bermaydi)', async () => {
      const o = await placeOrder();
      await ctx.http.post(`/api/v1/admin/orders/${o.id}/quotes`).set(manager).send({ ...terms, deliveryFee: 80_000 }).expect(201);
      await drain();
      const list = await notifications();
      expect(list.map((n) => n.type)).toEqual(['order.quote']);
      expect(list[0]!.body).toContain('4 700 000');
    });

    it('mijoz taklifni qabul qilsa — unga emas, Telegram\'ga', async () => {
      const o = await placeOrder();
      const q = await ctx.http.post(`/api/v1/admin/orders/${o.id}/quotes`).set(manager).send(terms).expect(201);
      await drain();
      ctx.telegram.messages = [];
      await ctx.http.post(`/api/v1/orders/${o.id}/quotes/${q.body.quote.id}/accept`).set(customer.auth).expect(200);
      await drain();
      expect((await notifications()).map((n) => n.type)).toEqual(['order.quote']);
      expect(ctx.telegram.messages[0]).toContain('Mijoz taklifni qabul qildi');
    });

    it('olib ketishga tayyor — maxsus matn', async () => {
      const o = await placeOrder();
      await go(o.id, { to: 'CONFIRMED', terms }).expect(200);
      await go(o.id, { to: 'PREPARING' }).expect(200);
      await go(o.id, { to: 'READY' }).expect(200);
      await drain();
      expect((await notifications()).map((n) => n.title)).toEqual([
        'Buyurtma tasdiqlandi',
        'Buyurtma tayyorlanmoqda',
        'Olib ketishga tayyor',
      ]);
    });

    it('to\'lov: chek Telegram\'ga, tasdiq mijozga', async () => {
      const o = await placeOrder();
      await go(o.id, { to: 'CONFIRMED', terms }).expect(200);
      const up = await ctx.http.post('/api/v1/uploads/receipts').set(customer.auth).attach('file', PNG, 'c.png').expect(201);
      const p = await ctx.http
        .post(`/api/v1/orders/${o.id}/payments`)
        .set(customer.auth)
        .send({ amount: 1_000_000, method: 'CARD_TRANSFER', receiptUploadId: up.body.id })
        .expect(201);
      await drain();
      expect(ctx.telegram.messages.at(-1)).toContain('Yangi chek: 1 000 000 so\'m');

      await ctx.http.post(`/api/v1/admin/payments/${p.body.id}/confirm`).set(manager).expect(200);
      await drain();
      expect((await notifications()).at(-1)).toMatchObject({ type: 'payment.confirmed', body: `1 000 000 so'm qabul qilindi (${o.number})` });
    });

    it('yaroqsiz push token o\'chiriladi', async () => {
      ctx.push.invalid.add('ExponentPushToken[mijoz]');
      const o = await placeOrder();
      await go(o.id, { to: 'CONFIRMED', terms }).expect(200);
      await drain();
      expect(await ctx.prisma.deviceToken.count()).toBe(0);
    });

    it('API: ro\'yxat, o\'qilmaganlar soni, o\'qildi', async () => {
      const o = await placeOrder();
      await go(o.id, { to: 'CONFIRMED', terms }).expect(200);
      await go(o.id, { to: 'PREPARING' }).expect(200);
      await drain();
      const list = await ctx.http.get('/api/v1/notifications').set(customer.auth).expect(200);
      expect(list.body).toMatchObject({ total: 2, unread: 2 });
      expect(list.body.items[0]).not.toHaveProperty('eventId');
      await ctx.http.post('/api/v1/notifications/read').set(customer.auth).send({}).expect(422);
      await ctx.http.post('/api/v1/notifications/read').set(customer.auth).send({ all: true }).expect(200);
      expect((await ctx.http.get('/api/v1/notifications').set(customer.auth)).body.unread).toBe(0);
    });
  });

  describe('nasiya eslatmalari', () => {
    it('muddatdan 2 kun oldin, kunida, o\'tgandan keyin har 3 kunda; kuniga bir marta', async () => {
      const o = await placeOrder();
      const due = new Date('2026-11-10T00:00:00Z');
      await ctx.prisma.order.update({
        where: { id: o.id },
        data: { status: 'COMPLETED', paymentTerms: 'CREDIT', grandTotal: 4_620_000n, paidTotal: 620_000n, dueDate: due },
      });
      const reminders = ctx.app.get(DebtReminderScheduler);

      expect(await reminders.run('2026-11-07')).toBe(0);
      expect(await reminders.run('2026-11-08')).toBe(1);
      expect(await reminders.run('2026-11-08')).toBe(0);
      expect(await reminders.run('2026-11-10')).toBe(1);
      expect(await reminders.run('2026-11-12')).toBe(0);
      expect(await reminders.run('2026-11-13')).toBe(1);

      const list = await notifications();
      expect(list.map((n) => n.type)).toEqual(['debt.soon', 'debt.soon', 'debt.overdue']);
      expect(list[2]!.body).toBe(`${o.number}: 4 000 000 so'm qarz, muddat 2026-11-10 edi`);
    });
  });

  describe('socket', () => {
    it('tokensiz ulanish uziladi', async () => {
      await expect(connect()).rejects.toThrow();
      await expect(connect('buzilgan.token.x')).rejects.toThrow();
    });

    it('xodimlar yangi buyurtmani real-time oladi', async () => {
      const staff = await connect(token(manager));
      const got = next(staff, RT.ORDER_CREATED);
      const o = await placeOrder();
      await drain();
      expect(await got).toMatchObject({ id: o.id, number: o.number, grandTotal: 4_620_000 });
    });

    it('buyurtma xonasi: faqat o\'z buyurtmasi; status o\'zgarishi keladi', async () => {
      const o = await placeOrder();
      const mine = await connect(token(customer.auth));
      const stranger = await connect(token((await userWithToken(ctx, 'CUSTOMER')).auth));

      expect(await mine.emitWithAck(RT.ORDER_SUBSCRIBE, { orderId: o.id })).toEqual({ ok: true });
      expect(await stranger.emitWithAck(RT.ORDER_SUBSCRIBE, { orderId: o.id })).toEqual({ ok: false, error: 'NOT_FOUND' });

      const status = next(mine, RT.ORDER_STATUS_CHANGED);
      const notif = next(mine, RT.NOTIFICATION);
      await go(o.id, { to: 'CONFIRMED', terms }).expect(200);
      await drain();
      expect(await status).toMatchObject({ orderId: o.id, from: 'NEW', to: 'CONFIRMED' });
      expect(await notif).toMatchObject({ type: 'order.confirmed' });
    });
  });

  describe('chat', () => {
    const msgs = (id: string, auth: Auth) => ctx.http.get(`/api/v1/orders/${id}/messages`).set(auth);
    const send = (id: string, auth: Auth, body: object) => ctx.http.post(`/api/v1/orders/${id}/messages`).set(auth).send(body);

    it('mijoz yozadi → menejer real-time oladi; menejer javob → mijozga push', async () => {
      const o = await placeOrder();
      const staff = await connect(token(manager));
      const incoming = next(staff, RT.CHAT_MESSAGE);

      const m1 = await send(o.id, customer.auth, { text: 'Kromka ham kerak, 25 metr' }).expect(201);
      expect(m1.body).toMatchObject({ text: 'Kromka ham kerak, 25 metr', sender: { role: 'CUSTOMER' } });
      await drain();
      expect(await incoming).toMatchObject({ id: m1.body.id, orderNumber: o.number });
      expect(await notifications(managerUser.user.id)).toEqual([]);

      await send(o.id, manager, { text: 'Qo\'shib taklif yuboraman' }).expect(201);
      await drain();
      const [n] = await notifications();
      expect(n).toMatchObject({ type: 'chat.message', body: `${o.number}: Qo'shib taklif yuboraman` });
      expect(ctx.push.sent.at(-1)!.title).toBe('Menejerdan xabar');

      const list = await msgs(o.id, customer.auth).expect(200);
      expect(list.body.items.map((m: { text: string }) => m.text)).toEqual(['Kromka ham kerak, 25 metr', 'Qo\'shib taklif yuboraman']);
    });

    it('o\'qilmaganlar soni va o\'qildi belgisi', async () => {
      const o = await placeOrder();
      await send(o.id, customer.auth, { text: 'Salom' }).expect(201);
      await send(o.id, customer.auth, { text: 'Qachon tayyor?' }).expect(201);
      await send(o.id, manager, { text: 'Ertaga' }).expect(201);

      const admin = await ctx.http.get('/api/v1/admin/orders').set(manager).expect(200);
      expect(admin.body.items[0].unreadMessages).toBe(2);
      const mine = await ctx.http.get('/api/v1/orders').set(customer.auth).expect(200);
      expect(mine.body.items[0].unreadMessages).toBe(1);

      expect((await ctx.http.post(`/api/v1/orders/${o.id}/messages/read`).set(manager).expect(200)).body.updated).toBe(2);
      expect((await ctx.http.get('/api/v1/admin/orders').set(manager)).body.items[0].unreadMessages).toBe(0);
      expect((await ctx.http.get('/api/v1/orders').set(customer.auth)).body.items[0].unreadMessages).toBe(1);
    });

    it('sahifalash: eskiroqlarni yuklash', async () => {
      const o = await placeOrder();
      for (let i = 1; i <= 5; i++) await send(o.id, customer.auth, { text: `x${i}` }).expect(201);
      const last = await ctx.http.get(`/api/v1/orders/${o.id}/messages?limit=2`).set(customer.auth).expect(200);
      expect(last.body).toMatchObject({ hasMore: true });
      expect(last.body.items.map((m: { text: string }) => m.text)).toEqual(['x4', 'x5']);
      const older = await ctx.http
        .get(`/api/v1/orders/${o.id}/messages?limit=10&before=${last.body.items[0].id}`)
        .set(customer.auth)
        .expect(200);
      expect(older.body.items.map((m: { text: string }) => m.text)).toEqual(['x1', 'x2', 'x3']);
      expect(older.body.hasMore).toBe(false);
    });

    it('fayl ilova: yuklash, yuborish, faqat ishtirokchilar ko\'radi', async () => {
      const o = await placeOrder();
      const up = await ctx.http.post('/api/v1/uploads/chat').set(customer.auth).attach('file', PNG, 'chizma.png').expect(201);
      const m = await send(o.id, customer.auth, { attachmentUploadId: up.body.id }).expect(201);
      expect(m.body.attachment).toMatchObject({ mimeType: 'image/png' });

      const url = `/api/v1/chat/messages/${m.body.id}/attachment`;
      await ctx.http.get(url).set(manager).expect(200).expect('Content-Type', 'image/png');
      await ctx.http.get(url).set((await userWithToken(ctx, 'CUSTOMER')).auth).expect(404);
      // Boshqa xabarga qayta biriktirib bo'lmaydi
      await send(o.id, customer.auth, { attachmentUploadId: up.body.id }).expect(409);
    });

    it('bo\'sh xabar 422, begona buyurtma 404, omborchi 403', async () => {
      const o = await placeOrder();
      await send(o.id, customer.auth, {}).expect(422);
      await send(o.id, (await userWithToken(ctx, 'CUSTOMER')).auth, { text: 'x' }).expect(404);
      await send(o.id, (await userWithToken(ctx, 'WAREHOUSE')).auth, { text: 'x' }).expect(403);
    });
  });
});
