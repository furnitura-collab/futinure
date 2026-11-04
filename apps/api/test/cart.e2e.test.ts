import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedCatalog, userWithToken } from './fixtures.js';

describe('savat, sevimlilar, manzillar (e2e)', () => {
  let ctx: TestContext;
  let c: Awaited<ReturnType<typeof seedCatalog>>;
  let auth: Record<string, string>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    c = await seedCatalog(ctx);
    auth = (await userWithToken(ctx, 'CUSTOMER', { priceGroupId: c.usta.id })).auth;
  });

  const put = (variantId: string, qty: string | number) =>
    ctx.http.put(`/api/v1/cart/items/${variantId}`).set(auth).send({ qty });

  describe('savat', () => {
    it('xodim savatdan foydalanmaydi', async () => {
      const m = (await userWithToken(ctx, 'MANAGER')).auth;
      await ctx.http.get('/api/v1/cart').set(m).expect(403);
    });

    it('qo\'shish, shaxsiy narx, jami', async () => {
      await put(c.white.id, 12).expect(200);
      const res = await put(c.hingeV.id, 4).expect(200);
      expect(res.body.count).toBe(2);
      expect(res.body.lines.map((l: { unitPrice: number }) => l.unitPrice)).toEqual([380_000, 14_000]);
      expect(res.body.itemsTotal).toBe(12 * 380_000 + 4 * 14_000);
      expect(res.body.hasBlockingIssues).toBe(false);
    });

    it('qatorda kichik rasm uchun kategoriya, tur va rasm', async () => {
      await ctx.prisma.productImage.create({ data: { productId: c.board.id, url: '/uploads/catalog/ldsp.webp' } });
      await put(c.white.id, 2).expect(200);
      const res = await put(c.hingeV.id, 2).expect(200);
      expect(res.body.lines[0]).toMatchObject({ categoryId: c.ldsp.id, kind: 'BOARD', imageUrl: '/uploads/catalog/ldsp.webp' });
      expect(res.body.lines[1]).toMatchObject({ categoryId: c.furnitura.id, kind: 'GOODS', imageUrl: null });
    });

    it('PUT miqdorni almashtiradi, qo\'shmaydi', async () => {
      await put(c.white.id, 12).expect(200);
      const res = await put(c.white.id, 3).expect(200);
      expect(res.body.lines[0].qty).toBe('3');
    });

    it('qoidaga zid miqdor saqlanmaydi', async () => {
      const res = await put(c.hingeV.id, 3).expect(422);
      expect(res.body.error).toMatchObject({ code: 'INVALID_QTY', details: { code: 'NOT_MULTIPLE_OF_STEP', qtyStep: '2' } });
      expect(await ctx.prisma.cartItem.count()).toBe(0);
    });

    it('tugagan, nofaol va mavjud bo\'lmagan tovar', async () => {
      await ctx.prisma.productVariant.update({ where: { id: c.black.id }, data: { stockQty: 0 } });
      expect((await put(c.black.id, 1).expect(409)).body.error.code).toBe('OUT_OF_STOCK');
      await ctx.prisma.productVariant.update({ where: { id: c.white.id }, data: { isActive: false } });
      expect((await put(c.white.id, 1).expect(409)).body.error.code).toBe('INACTIVE');
      await put('01900000-0000-7000-8000-000000000000', 1).expect(404);
    });

    it('qoldiqdan ko\'p — savatga tushadi, lekin ogohlantirish bilan', async () => {
      const res = await put(c.black.id, 10).expect(200);
      expect(res.body.lines[0].issues).toEqual([{ code: 'EXCEEDS_AVAILABLE', available: '6' }]);
      expect(res.body.hasIssues).toBe(true);
      expect(res.body.hasBlockingIssues).toBe(false);
    });

    it('savatdagi tovar keyin nofaol bo\'lsa — to\'sqinlik qiluvchi muammo', async () => {
      await put(c.white.id, 1).expect(200);
      await ctx.prisma.product.update({ where: { id: c.board.id }, data: { isActive: false } });
      const res = await ctx.http.get('/api/v1/cart').set(auth).expect(200);
      expect(res.body.hasBlockingIssues).toBe(true);
    });

    it('o\'chirish va tozalash', async () => {
      await put(c.white.id, 1).expect(200);
      await put(c.hingeV.id, 2).expect(200);
      const res = await ctx.http.delete(`/api/v1/cart/items/${c.white.id}`).set(auth).expect(200);
      expect(res.body.count).toBe(1);
      await ctx.http.delete('/api/v1/cart').set(auth).expect(204);
      expect((await ctx.http.get('/api/v1/cart').set(auth)).body.count).toBe(0);
    });

    it('SKU bo\'yicha tez qo\'shish: mavjudiga qo\'shiladi, har SKU natijasi', async () => {
      await put(c.hingeV.id, 2).expect(200);
      const res = await ctx.http
        .post('/api/v1/cart/items/bulk')
        .set(auth)
        .send({
          items: [
            { sku: 'gtv-pb-110', qty: 4 },
            { sku: 'KR-W980-16', qty: 5 },
            { sku: 'YOQ-SKU', qty: 1 },
            { sku: 'GTV-PB-110', qty: 1 },
          ],
        })
        .expect(200);
      expect(res.body.results.map((r: { status: string }) => r.status)).toEqual([
        'ADDED',
        'ADDED',
        'NOT_FOUND',
        'NOT_MULTIPLE_OF_STEP',
      ]);
      const hinge = res.body.cart.lines.find((l: { sku: string }) => l.sku === 'GTV-PB-110');
      expect(hinge.qty).toBe('6');
    });
  });

  describe('sevimlilar', () => {
    it('qo\'shish, ro\'yxat (kartochka), o\'chirish', async () => {
      await ctx.http.put(`/api/v1/favorites/${c.board.id}`).set(auth).expect(204);
      await ctx.http.put(`/api/v1/favorites/${c.board.id}`).set(auth).expect(204);
      const res = await ctx.http.get('/api/v1/favorites').set(auth).expect(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toMatchObject({ id: c.board.id, priceFrom: 380_000 });
      await ctx.http.delete(`/api/v1/favorites/${c.board.id}`).set(auth).expect(204);
      expect((await ctx.http.get('/api/v1/favorites').set(auth)).body).toEqual([]);
    });

    it('nofaol mahsulot qo\'shilmaydi', async () => {
      await ctx.prisma.product.update({ where: { id: c.hinge.id }, data: { isActive: false } });
      await ctx.http.put(`/api/v1/favorites/${c.hinge.id}`).set(auth).expect(404);
    });
  });

  describe('manzillar', () => {
    const address = { label: 'Sex', addressText: 'Toshkent, Chilonzor 5', lat: 41.28, lng: 69.2 };

    it('yaratish va yangilash', async () => {
      const res = await ctx.http.post('/api/v1/addresses').set(auth).send(address).expect(201);
      expect(res.body).toMatchObject({ ...address, floor: null, needsLoaders: false });
      const upd = await ctx.http.patch(`/api/v1/addresses/${res.body.id}`).set(auth).send({ floor: 3 }).expect(200);
      expect(upd.body.floor).toBe(3);
    });

    it('O\'zbekistondan tashqari koordinata — 422', async () => {
      await ctx.http.post('/api/v1/addresses').set(auth).send({ ...address, lat: 55.75, lng: 37.61 }).expect(422);
    });

    it('boshqa mijozning manzili ko\'rinmaydi va o\'zgarmaydi', async () => {
      const res = await ctx.http.post('/api/v1/addresses').set(auth).send(address).expect(201);
      const other = (await userWithToken(ctx, 'CUSTOMER')).auth;
      expect((await ctx.http.get('/api/v1/addresses').set(other)).body).toEqual([]);
      await ctx.http.patch(`/api/v1/addresses/${res.body.id}`).set(other).send({ floor: 1 }).expect(404);
      await ctx.http.delete(`/api/v1/addresses/${res.body.id}`).set(other).expect(404);
    });
  });
});
