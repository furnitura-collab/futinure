import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedCatalog, userWithToken } from './fixtures.js';

describe('katalog — mijoz (e2e)', () => {
  let ctx: TestContext;
  let c: Awaited<ReturnType<typeof seedCatalog>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.app.close();
  });
  beforeEach(async () => {
    await resetDb(ctx);
    c = await seedCatalog(ctx);
  });

  it('kategoriyalar daraxti, nofaollari yashirin', async () => {
    const res = await ctx.http.get('/api/v1/categories').expect(200);
    const slugs = res.body.map((n: { slug: string }) => n.slug);
    expect(slugs).toContain('plitalar');
    expect(slugs).not.toContain('arxiv');
    const plitalar = res.body.find((n: { slug: string }) => n.slug === 'plitalar');
    expect(plitalar.children.map((n: { slug: string }) => n.slug)).toEqual(['ldsp']);
  });

  describe('ro\'yxat', () => {
    it('mehmon chakana narxni ko\'radi, nofaol kategoriya mahsuloti yo\'q', async () => {
      const res = await ctx.http.get('/api/v1/products').expect(200);
      expect(res.body.total).toBe(3);
      const board = res.body.items.find((p: { id: string }) => p.id === c.board.id);
      expect(board).toMatchObject({ priceFrom: 395_000, basePriceFrom: 395_000, stockLevel: 'IN_STOCK', variantCount: 2 });
    });

    it('usta guruhidagi mijoz shaxsiy narxni ko\'radi', async () => {
      const { auth } = await userWithToken(ctx, 'CUSTOMER', { priceGroupId: c.usta.id });
      const res = await ctx.http.get('/api/v1/products').set(auth).expect(200);
      const board = res.body.items.find((p: { id: string }) => p.id === c.board.id);
      expect(board.priceFrom).toBe(380_000);
      expect(board.basePriceFrom).toBe(395_000);
    });

    it('"...dan" narxi tugagan variantni hisobga olmaydi', async () => {
      // Arzonroq, lekin tugagan variant
      await ctx.prisma.productVariant.create({
        data: { productId: c.board.id, sku: 'KR-CHEAP', basePrice: 100_000n, stockQty: 0 },
      });
      const res = await ctx.http.get('/api/v1/products').expect(200);
      const board = res.body.items.find((p: { id: string }) => p.id === c.board.id);
      expect(board.priceFrom).toBe(395_000);
    });

    it('ota kategoriya bo\'yicha filtr ichki kategoriyalarni ham oladi', async () => {
      const res = await ctx.http.get(`/api/v1/products?categoryId=${c.plitalar.id}`).expect(200);
      expect(res.body.items.map((p: { id: string }) => p.id)).toEqual([c.board.id]);
    });

    it.each([
      ['nom bo\'yicha', 'kronospan'],
      ['ruscha nom', 'петля'],
      ['SKU bo\'yicha', 'w980'],
      ['xato yozilgan', 'kronspan'],
    ])('qidiruv: %s', async (_label, q) => {
      const res = await ctx.http.get(`/api/v1/products?q=${encodeURIComponent(q)}`).expect(200);
      expect(res.body.total).toBe(1);
    });

    it('qidiruvdagi % belgisi wildcard emas', async () => {
      const res = await ctx.http.get('/api/v1/products?q=%25').expect(200);
      expect(res.body.total).toBe(0);
    });

    it('faqat omborda borlari', async () => {
      const res = await ctx.http.get('/api/v1/products?inStock=true').expect(200);
      expect(res.body.items.map((p: { id: string }) => p.id).sort()).toEqual([c.board.id, c.hinge.id].sort());
    });

    it('narx bo\'yicha saralash va sahifalash', async () => {
      const page1 = await ctx.http.get('/api/v1/products?sort=price_asc&limit=2').expect(200);
      expect(page1.body.items.map((p: { priceFrom: number }) => p.priceFrom)).toEqual([14_000, 49_000]);
      const page2 = await ctx.http.get('/api/v1/products?sort=price_asc&limit=2&page=2').expect(200);
      expect(page2.body.items.map((p: { priceFrom: number }) => p.priceFrom)).toEqual([395_000]);
      expect(page2.body.total).toBe(3);
    });
  });

  describe('mahsulot sahifasi', () => {
    it('qoldiq darajasi ko\'rsatiladi, aniq son yashirin', async () => {
      const res = await ctx.http.get(`/api/v1/products/${c.board.id}`).expect(200);
      const white = res.body.variants.find((v: { sku: string }) => v.sku === 'KR-W980-16');
      const black = res.body.variants.find((v: { sku: string }) => v.sku === 'KR-0190-16');
      expect(white.stockLevel).toBe('IN_STOCK');
      expect(black.stockLevel).toBe('LOW');
      expect(white).not.toHaveProperty('stockQty');
      expect(white.tiers).toEqual([
        { minQty: '10', price: 385_000 },
        { minQty: '50', price: 375_000 },
      ]);
      expect(res.body.board).toEqual({ lengthMm: 2800, widthMm: 2070, thicknessMm: '16' });
    });

    it('usta uchun shaxsiy narxdan qimmat pog\'onalar ko\'rsatilmaydi', async () => {
      const { auth } = await userWithToken(ctx, 'CUSTOMER', { priceGroupId: c.usta.id });
      const res = await ctx.http.get(`/api/v1/products/${c.board.id}`).set(auth).expect(200);
      const white = res.body.variants.find((v: { sku: string }) => v.sku === 'KR-W980-16');
      expect(white.price).toBe(380_000);
      expect(white.tiers).toEqual([{ minQty: '50', price: 375_000 }]);
    });

    it('buyurtma asosidagi tovar muddati bilan', async () => {
      const res = await ctx.http.get(`/api/v1/products/${c.slide.id}`).expect(200);
      expect(res.body.variants[0]).toMatchObject({ stockLevel: 'ON_ORDER', leadTimeDays: 7 });
    });

    it('nofaol kategoriyadagi mahsulot 404', async () => {
      await ctx.http.get(`/api/v1/products/${c.old.id}`).expect(404);
    });

    it('SKU bo\'yicha (registrga qaramaydi)', async () => {
      const res = await ctx.http.get('/api/v1/variants/by-sku/kr-w980-16').expect(200);
      expect(res.body.variantId).toBe(c.white.id);
    });

    it('bozor token bilan ham public sahifa ochiladi', async () => {
      await ctx.http.get('/api/v1/products').set('Authorization', 'Bearer buzilgan').expect(200);
    });
  });

  describe('narx hisoblash (/pricing/quote)', () => {
    const quote = (items: { variantId: string; qty: string | number }[], auth = {}) =>
      ctx.http.post('/api/v1/pricing/quote').set(auth).send({ items });

    it('pog\'onali narx va jami', async () => {
      const res = await quote([
        { variantId: c.white.id, qty: 10 },
        { variantId: c.hingeV.id, qty: 4 },
      ]).expect(200);
      expect(res.body.lines.map((l: { unitPrice: number }) => l.unitPrice)).toEqual([385_000, 14_000]);
      expect(res.body.itemsTotal).toBe(3_850_000 + 56_000);
      expect(res.body.hasIssues).toBe(false);
      expect(res.body.totalWeightKg).toBe(450.4);
    });

    it('guruh narxi pog\'onadan arzon bo\'lsa', async () => {
      const { auth } = await userWithToken(ctx, 'CUSTOMER', { priceGroupId: c.usta.id });
      const res = await quote([{ variantId: c.white.id, qty: 10 }], auth).expect(200);
      expect(res.body.lines[0]).toMatchObject({ unitPrice: 380_000, priceReason: 'GROUP' });
    });

    it('miqdor qadami buzilsa', async () => {
      const res = await quote([{ variantId: c.hingeV.id, qty: 3 }]).expect(200);
      expect(res.body.lines[0].issues).toEqual([{ code: 'NOT_MULTIPLE_OF_STEP', minQty: '2', qtyStep: '2' }]);
    });

    it('qoldiqdan ko\'p — mavjud miqdor aytiladi', async () => {
      const res = await quote([{ variantId: c.black.id, qty: 8 }]).expect(200);
      expect(res.body.lines[0].issues).toEqual([{ code: 'EXCEEDS_AVAILABLE', available: '6' }]);
    });

    it('rezerv hisobga olinadi', async () => {
      await ctx.prisma.productVariant.update({ where: { id: c.black.id }, data: { reservedQty: 5 } });
      const res = await quote([{ variantId: c.black.id, qty: 2 }]).expect(200);
      expect(res.body.lines[0].issues).toEqual([{ code: 'EXCEEDS_AVAILABLE', available: '1' }]);
    });

    it('buyurtma asosidagi tovar qoldiqsiz ham buyurtma qilinadi', async () => {
      const res = await quote([{ variantId: c.slideV.id, qty: 20 }]).expect(200);
      expect(res.body.lines[0].issues).toEqual([]);
    });

    it('nofaol va mavjud bo\'lmagan variant', async () => {
      await ctx.prisma.productVariant.update({ where: { id: c.white.id }, data: { isActive: false } });
      const res = await quote([
        { variantId: c.white.id, qty: 1 },
        { variantId: '01900000-0000-7000-8000-000000000000', qty: 1 },
      ]).expect(200);
      expect(res.body.lines[0].issues).toEqual([{ code: 'INACTIVE' }]);
      expect(res.body.lines[1].issues).toEqual([{ code: 'NOT_FOUND' }]);
      expect(res.body.hasIssues).toBe(true);
    });

    it('noto\'g\'ri miqdor formati — 422', async () => {
      await quote([{ variantId: c.white.id, qty: '1.2345' }]).expect(422);
      await quote([{ variantId: c.white.id, qty: 0 }]).expect(422);
    });
  });
});
