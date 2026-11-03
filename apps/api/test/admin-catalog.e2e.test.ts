import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedCatalog, userWithToken } from './fixtures.js';

type Auth = Record<string, string>;

describe('katalog — admin (e2e)', () => {
  let ctx: TestContext;
  let c: Awaited<ReturnType<typeof seedCatalog>>;
  let manager: Auth;
  let admin: Auth;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    c = await seedCatalog(ctx);
    manager = (await userWithToken(ctx, 'MANAGER')).auth;
    admin = (await userWithToken(ctx, 'SUPER_ADMIN')).auth;
  });

  describe('ruxsatlar', () => {
    it('mijoz va tokensiz admin endpointlarga kira olmaydi', async () => {
      const customer = (await userWithToken(ctx, 'CUSTOMER')).auth;
      await ctx.http.get('/api/v1/admin/products').expect(401);
      await ctx.http.get('/api/v1/admin/products').set(customer).expect(403);
      await ctx.http.post('/api/v1/admin/stock/movements').set(customer).send({}).expect(403);
    });

    it('omborchi qoldiq kirita oladi, mahsulot o\'zgartira olmaydi', async () => {
      const wh = (await userWithToken(ctx, 'WAREHOUSE')).auth;
      await ctx.http
        .post('/api/v1/admin/stock/movements')
        .set(wh)
        .send({ type: 'IN', variantId: c.black.id, qty: 10 })
        .expect(201);
      await ctx.http.patch(`/api/v1/admin/products/${c.board.id}`).set(wh).send({ nameUz: 'x' }).expect(403);
      // Kirim uchun tovar qidira oladi
      await ctx.http.get('/api/v1/admin/products?q=kronospan').set(wh).expect(200);
      await ctx.http.get(`/api/v1/admin/products/${c.board.id}`).set(wh).expect(200);
      await ctx.http.get('/api/v1/admin/categories').set(wh).expect(403);
    });

    it('ommaviy narx va o\'chirish faqat super admin', async () => {
      await ctx.http
        .post('/api/v1/admin/prices/bulk-update')
        .set(manager)
        .send({ categoryId: c.ldsp.id, percent: 5 })
        .expect(403);
      await ctx.http.delete(`/api/v1/admin/products/${c.hinge.id}`).set(manager).expect(403);
    });
  });

  describe('kategoriya, mahsulot, variant', () => {
    it('to\'liq yaratish oqimi', async () => {
      const cat = await ctx.http
        .post('/api/v1/admin/categories')
        .set(manager)
        .send({ nameUz: 'Kromka', nameRu: 'Кромка', slug: 'kromka' })
        .expect(201);

      const product = await ctx.http
        .post('/api/v1/admin/products')
        .set(manager)
        .send({ categoryId: cat.body.id, nameUz: 'PVX kromka 2mm', nameRu: 'Кромка ПВХ 2мм', unit: 'METER', kind: 'EDGE', qtyStep: '0.5' })
        .expect(201);
      expect(product.body).toMatchObject({ qtyStep: '0.5', minQty: '1', variants: [] });

      const variant = await ctx.http
        .post(`/api/v1/admin/products/${product.body.id}/variants`)
        .set(manager)
        .send({ sku: 'RH-2-W980', basePrice: 4500, attributes: { color: 'Oq', width: 22 } })
        .expect(201);
      expect(variant.body).toMatchObject({ stockQty: '0', availableQty: '0', stockLevel: 'OUT_OF_STOCK', onOrder: false });

      const audit = await ctx.prisma.auditLog.count({ where: { entity: { in: ['category', 'product', 'variant'] } } });
      expect(audit).toBe(3);
    });

    it('plita o\'lchamlarsiz — 422', async () => {
      const res = await ctx.http
        .post('/api/v1/admin/products')
        .set(manager)
        .send({ categoryId: c.ldsp.id, nameUz: 'x', nameRu: 'x', unit: 'SHEET', kind: 'BOARD' })
        .expect(422);
      expect(res.body.error.details[0].message).toBe('BOARD_DIMENSIONS_REQUIRED');

      // Mavjud mahsulotni BOARD'ga o'tkazishda ham
      await ctx.http.patch(`/api/v1/admin/products/${c.hinge.id}`).set(manager).send({ kind: 'BOARD' }).expect(422);
    });

    it('takroriy SKU — 409', async () => {
      await ctx.http
        .post(`/api/v1/admin/products/${c.board.id}/variants`)
        .set(manager)
        .send({ sku: 'KR-W980-16', basePrice: 1 })
        .expect(409);
    });

    it('kategoriyani o\'z avlodiga ko\'chirib bo\'lmaydi', async () => {
      const res = await ctx.http
        .patch(`/api/v1/admin/categories/${c.plitalar.id}`)
        .set(manager)
        .send({ parentId: c.ldsp.id })
        .expect(400);
      expect(res.body.error.code).toBe('CATEGORY_CYCLE');
    });

    it('bo\'sh bo\'lmagan kategoriya o\'chirilmaydi', async () => {
      const res = await ctx.http.delete(`/api/v1/admin/categories/${c.ldsp.id}`).set(manager).expect(409);
      expect(res.body.error.details).toEqual({ products: 1, children: 0 });
    });

    it('narx o\'zgarishi tarixga yoziladi', async () => {
      await ctx.http.patch(`/api/v1/admin/variants/${c.white.id}`).set(manager).send({ basePrice: 410_000 }).expect(200);
      await ctx.http.patch(`/api/v1/admin/variants/${c.white.id}`).set(manager).send({ basePrice: 410_000 }).expect(200);
      const history = await ctx.http.get(`/api/v1/admin/variants/${c.white.id}/price-history`).set(manager).expect(200);
      expect(history.body).toHaveLength(1);
      expect(history.body[0]).toMatchObject({ oldPrice: 395_000, newPrice: 410_000, source: 'MANUAL' });
    });

    it('pog\'ona va guruh narxlarini almashtirish', async () => {
      const tiers = await ctx.http
        .put(`/api/v1/admin/variants/${c.white.id}/price-tiers`)
        .set(manager)
        .send([{ minQty: '20', price: 380_000 }])
        .expect(200);
      expect(tiers.body.priceTiers).toEqual([{ minQty: '20', price: 380_000 }]);

      await ctx.http
        .put(`/api/v1/admin/variants/${c.white.id}/price-tiers`)
        .set(manager)
        .send([{ minQty: '20', price: 1 }, { minQty: '20.0', price: 2 }])
        .expect(422);

      const groups = await ctx.http
        .put(`/api/v1/admin/variants/${c.white.id}/group-prices`)
        .set(manager)
        .send([])
        .expect(200);
      expect(groups.body.groupPrices).toEqual([]);
    });

    it('buyurtmada ishlatilmagan mahsulot o\'chiriladi', async () => {
      await ctx.http.delete(`/api/v1/admin/products/${c.hinge.id}`).set(admin).expect(204);
      expect(await ctx.prisma.productVariant.count({ where: { id: c.hingeV.id } })).toBe(0);
    });

    it('admin ro\'yxati: aniq qoldiq va kam qolganlar filtri', async () => {
      const res = await ctx.http.get('/api/v1/admin/products?lowStock=true').set(manager).expect(200);
      expect(res.body.items.map((p: { id: string }) => p.id).sort()).toEqual([c.board.id, c.slide.id].sort());
      const board = res.body.items.find((p: { id: string }) => p.id === c.board.id);
      const black = board.variants.find((v: { sku: string }) => v.sku === 'KR-0190-16');
      expect(black).toMatchObject({ stockQty: '6', reservedQty: '0', availableQty: '6', stockLevel: 'LOW' });
    });
  });

  describe('ombor', () => {
    it('kirim va inventarizatsiya, harakatlar tarixi', async () => {
      await ctx.http
        .post('/api/v1/admin/stock/movements')
        .set(manager)
        .send({ type: 'IN', variantId: c.black.id, qty: '14', reason: 'Yetkazib beruvchidan' })
        .expect(201);
      const adj = await ctx.http
        .post('/api/v1/admin/stock/movements')
        .set(manager)
        .send({ type: 'ADJUST', variantId: c.black.id, actualQty: '18', reason: 'Sanoq' })
        .expect(201);
      expect(adj.body.variant.stockQty).toBe('18');
      expect(adj.body.movement).toMatchObject({ type: 'ADJUST', qty: '-2' });

      const list = await ctx.http.get(`/api/v1/admin/stock/variants/${c.black.id}/movements`).set(manager).expect(200);
      expect(list.body.items.map((m: { qty: string }) => m.qty)).toEqual(['-2', '14']);
    });

    it('inventarizatsiya band miqdordan kam bo\'lolmaydi', async () => {
      await ctx.prisma.productVariant.update({ where: { id: c.black.id }, data: { reservedQty: 4 } });
      const res = await ctx.http
        .post('/api/v1/admin/stock/movements')
        .set(manager)
        .send({ type: 'ADJUST', variantId: c.black.id, actualQty: '3', reason: 'Sanoq' })
        .expect(409);
      expect(res.body.error).toMatchObject({ code: 'STOCK_BELOW_RESERVED', details: { reservedQty: '4' } });
    });

    it('parallel kirimlar yo\'qolmaydi', async () => {
      await Promise.all(
        Array.from({ length: 10 }, () =>
          ctx.http
            .post('/api/v1/admin/stock/movements')
            .set(manager)
            .send({ type: 'IN', variantId: c.black.id, qty: 1 })
            .expect(201),
        ),
      );
      const v = await ctx.prisma.productVariant.findUniqueOrThrow({ where: { id: c.black.id } });
      expect(v.stockQty.toString()).toBe('16');
    });

    it('kam qolganlar ro\'yxati', async () => {
      const res = await ctx.http.get('/api/v1/admin/stock/low').set(manager).expect(200);
      expect(res.body.map((r: { sku: string }) => r.sku)).toEqual(['GTV-SL-500', 'KR-0190-16']);
    });
  });

  describe('ommaviy narx', () => {
    const body = (extra: object) => ({ categoryId: c.plitalar.id, percent: 5, roundTo: 1000, ...extra });

    it('dry-run hech narsani o\'zgartirmaydi', async () => {
      const res = await ctx.http.post('/api/v1/admin/prices/bulk-update').set(admin).send(body({})).expect(200);
      expect(res.body.summary.variantCount).toBe(2);
      expect(res.body.preview.find((p: { sku: string }) => p.sku === 'KR-W980-16')).toMatchObject({
        oldPrice: 395_000,
        newPrice: 415_000,
      });
      const v = await ctx.prisma.productVariant.findUniqueOrThrow({ where: { id: c.white.id } });
      expect(v.basePrice).toBe(395_000n);
    });

    it('saqlash: asosiy, pog\'ona va guruh narxlari birga', async () => {
      await ctx.http.post('/api/v1/admin/prices/bulk-update').set(admin).send(body({ dryRun: false })).expect(200);
      const v = await ctx.prisma.productVariant.findUniqueOrThrow({
        where: { id: c.white.id },
        include: { priceTiers: { orderBy: { minQty: 'asc' } }, groupPrices: true },
      });
      expect(v.basePrice).toBe(415_000n); // 414 750 → 415 000
      expect(v.priceTiers.map((t) => t.price)).toEqual([404_000n, 394_000n]);
      expect(v.groupPrices[0]!.price).toBe(399_000n);
      // Boshqa kategoriya tegilmagan
      const hinge = await ctx.prisma.productVariant.findUniqueOrThrow({ where: { id: c.hingeV.id } });
      expect(hinge.basePrice).toBe(14_000n);
      expect(await ctx.prisma.priceHistory.count({ where: { source: 'BULK' } })).toBe(2);
    });

    it('filtrsiz — rad etiladi', async () => {
      await ctx.http.post('/api/v1/admin/prices/bulk-update').set(admin).send({ percent: 5 }).expect(400);
    });
  });

  describe('rasm yuklash', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );

    it('PNG yuklanadi va statik beriladi', async () => {
      const res = await ctx.http
        .post('/api/v1/admin/uploads/images')
        .set(manager)
        .attach('file', png, 'pixel.png')
        .expect(201);
      expect(res.body.url).toMatch(/^\/uploads\/catalog\/\d{4}-\d{2}\/[0-9a-f-]+\.png$/);
      await ctx.http.get(res.body.url).expect(200).expect('Content-Type', /image\/png/);

      await ctx.http
        .post(`/api/v1/admin/products/${c.board.id}/images`)
        .set(manager)
        .send({ url: res.body.url })
        .expect(201);
      const card = await ctx.http.get(`/api/v1/products?q=kronospan`).expect(200);
      expect(card.body.items[0].imageUrl).toBe(res.body.url);
    });

    it('rasm emas — kengaytmasi .png bo\'lsa ham rad etiladi', async () => {
      await ctx.http
        .post('/api/v1/admin/uploads/images')
        .set(manager)
        .attach('file', Buffer.from('<?php echo 1; ?> padding padding'), 'shell.png')
        .expect(415);
    });
  });
});
