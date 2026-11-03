import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDb, type TestContext } from './app.js';
import { seedCatalog, userWithToken } from './fixtures.js';

type Row = Record<string, string | number>;

async function xlsx(rows: Row[], columns?: string[]): Promise<Buffer> {
  const cols = columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Mahsulotlar');
  ws.addRow(cols);
  for (const r of rows) ws.addRow(cols.map((c) => r[c] ?? null));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const kromka = (over: Row = {}): Row => ({
  product_code: 'KROMKA-2',
  category_slug: 'furnitura',
  brand: 'Rehau',
  name_uz: 'PVX kromka 2 mm',
  name_ru: 'Кромка ПВХ 2 мм',
  unit: 'meter',
  kind: 'EDGE',
  qty_step: '0,5',
  sku: 'RH-2-W980',
  price: '4 500',
  stock: 3000,
  'attr:color': 'Oq',
  'attr:width': 22,
  'group:Usta': 4300,
  tier1_qty: 100,
  tier1_price: 4200,
  ...over,
});

describe('katalog — Excel (e2e)', () => {
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
    auth = (await userWithToken(ctx, 'MANAGER')).auth;
  });

  const upload = (buf: Buffer, commit = false) =>
    ctx.http
      .post(`/api/v1/admin/catalog/import?commit=${commit}`)
      .set(auth)
      .attach('file', buf, 'katalog.xlsx');

  it('dry-run: natijani ko\'rsatadi, saqlamaydi', async () => {
    const buf = await xlsx([kromka(), kromka({ sku: 'RH-2-K001', 'attr:color': 'Yong\'oq', 'group:Usta': '' })]);
    const res = await upload(buf).expect(200);
    expect(res.body).toMatchObject({
      committed: false,
      rows: 2,
      errors: [],
      summary: { productsCreated: 1, variantsCreated: 2, stockChanges: 2, brandsCreated: ['Rehau'] },
    });
    expect(await ctx.prisma.product.count({ where: { code: 'KROMKA-2' } })).toBe(0);
  });

  it('commit: mahsulot, variantlar, narxlar va boshlang\'ich qoldiq', async () => {
    const buf = await xlsx([kromka(), kromka({ sku: 'RH-2-K001', 'attr:color': 'Yong\'oq', 'group:Usta': '' })]);
    const res = await upload(buf, true).expect(200);
    expect(res.body.committed).toBe(true);

    const product = await ctx.prisma.product.findUniqueOrThrow({
      where: { code: 'KROMKA-2' },
      include: { brand: true, variants: { orderBy: { sku: 'asc' }, include: { priceTiers: true, groupPrices: true } } },
    });
    expect(product).toMatchObject({ unit: 'METER', kind: 'EDGE', brand: { name: 'Rehau' } });
    expect(product.qtyStep.toString()).toBe('0.5');
    const [k001, w980] = product.variants;
    expect(w980).toMatchObject({ sku: 'RH-2-W980', basePrice: 4500n, attributes: { color: 'Oq', width: 22 } });
    expect(w980!.stockQty.toString()).toBe('3000');
    expect(w980!.priceTiers.map((t) => [t.minQty.toString(), t.price])).toEqual([['100', 4200n]]);
    expect(w980!.groupPrices.map((g) => g.price)).toEqual([4300n]);
    expect(k001!.groupPrices).toEqual([]);
    expect(await ctx.prisma.stockMovement.count({ where: { type: 'IN' } })).toBe(2);
  });

  it('xatolar: qator raqami bilan, hech narsa saqlanmaydi', async () => {
    const buf = await xlsx([
      kromka(),
      kromka({ sku: 'RH-2-W980' }), // takroriy SKU
      kromka({ product_code: 'X', sku: 'X-1', category_slug: 'yoq-kategoriya' }),
      kromka({ product_code: 'Y', sku: 'Y-1', unit: 'litr', price: 'qimmat' }),
      kromka({ product_code: 'KROMKA-2', sku: 'Z-1', name_uz: 'Boshqa nom' }), // mahsulot maydonlari farq qiladi
      kromka({ product_code: 'B', sku: 'B-1', kind: 'BOARD' }), // o'lchamsiz plita
      kromka({ product_code: 'G', sku: 'G-1', 'group:Diler': 1 }), // bunday guruh yo'q
    ]);
    const res = await upload(buf, true).expect(200);
    expect(res.body.committed).toBe(false);
    const errs = res.body.errors.map((e: { row: number; column: string }) => `${e.row}:${e.column}`);
    expect(errs).toEqual(
      expect.arrayContaining(['3:sku', '5:unit', '5:price', '6:product_code', '7:board_length_mm']),
    );
    expect(await ctx.prisma.product.count({ where: { code: 'KROMKA-2' } })).toBe(0);
  });

  it('kategoriya va guruh topilmasa — xato', async () => {
    const buf = await xlsx([
      kromka({ category_slug: 'yoq' }),
      kromka({ product_code: 'G', sku: 'G-1', 'group:Diler': 1 }),
    ]);
    const res = await upload(buf).expect(200);
    expect(res.body.errors.map((e: { column: string }) => e.column).sort()).toEqual(['category_slug', 'group:Diler']);
  });

  it('majburiy ustun yo\'q', async () => {
    const res = await upload(await xlsx([{ product_code: 'A', sku: 'A' }])).expect(200);
    expect(res.body.errors.map((e: { column: string }) => e.column)).toEqual(
      expect.arrayContaining(['category_slug', 'name_uz', 'name_ru', 'unit', 'price']),
    );
  });

  it('xlsx bo\'lmagan fayl — 422', async () => {
    await upload(Buffer.from('a,b,c\n1,2,3')).expect(422);
  });

  it('eksport → o\'zgartirmasdan import = o\'zgarish yo\'q', async () => {
    const exp = await ctx.http
      .get('/api/v1/admin/catalog/export.xlsx')
      .set(auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200)
      .expect('Content-Type', /spreadsheetml/);

    const res = await upload(exp.body as Buffer).expect(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.summary).toEqual({
      productsCreated: 0,
      productsUpdated: 0,
      variantsCreated: 0,
      variantsUpdated: 0,
      priceChanges: 0,
      stockChanges: 0,
      brandsCreated: [],
    });
  });

  it('mavjud SKU narxi va qoldig\'ini yangilash', async () => {
    const row: Row = {
      product_code: 'LDSP-16',
      category_slug: 'ldsp',
      brand: 'Kronospan',
      name_uz: 'LDSP Kronospan 16 mm',
      name_ru: 'ЛДСП Kronospan 16 мм',
      unit: 'SHEET',
      kind: 'BOARD',
      weight_kg: 45,
      volume_m3: 0.092,
      board_length_mm: 2800,
      board_width_mm: 2070,
      thickness_mm: 16,
      sku: 'KR-0190-16',
      price: 430_000,
      stock: 10,
      'attr:color': 'Qora',
      'attr:decor_code': '0190',
    };
    const dry = await upload(await xlsx([row])).expect(200);
    expect(dry.body.summary).toMatchObject({ productsUpdated: 0, variantsUpdated: 1, priceChanges: 1, stockChanges: 1 });

    await upload(await xlsx([row]), true).expect(200);
    const v = await ctx.prisma.productVariant.findUniqueOrThrow({ where: { id: c.black.id } });
    expect(v.basePrice).toBe(430_000n);
    expect(v.stockQty.toString()).toBe('10');
    expect(await ctx.prisma.priceHistory.count({ where: { variantId: c.black.id, source: 'IMPORT' } })).toBe(1);
    const mv = await ctx.prisma.stockMovement.findFirstOrThrow({ where: { variantId: c.black.id } });
    expect(mv.type).toBe('ADJUST');
    expect(mv.qty.toString()).toBe('4');
    // Faylda tier va group ustunlari yo'q — mavjudlariga tegilmagan (boshqa variantda)
    expect(await ctx.prisma.variantPriceTier.count({ where: { variantId: c.white.id } })).toBe(2);
  });

  it('qoldiq band miqdordan kam bo\'lsa — xato', async () => {
    await ctx.prisma.productVariant.update({ where: { id: c.hingeV.id }, data: { reservedQty: 100 } });
    const res = await upload(
      await xlsx([
        {
          product_code: 'PETLYA',
          category_slug: 'furnitura',
          name_uz: 'Petlya dovodchikli',
          name_ru: 'Петля с доводчиком',
          unit: 'PIECE',
          min_qty: 2,
          qty_step: 2,
          weight_kg: 0.1,
          sku: 'GTV-PB-110',
          price: 14_000,
          stock: 50,
        },
      ]),
    ).expect(200);
    expect(res.body.errors).toEqual([expect.objectContaining({ column: 'stock' })]);
  });

  it('kodsiz mahsulot SKU orqali topiladi va unga kod beriladi', async () => {
    await ctx.prisma.product.update({ where: { id: c.hinge.id }, data: { code: null } });
    const res = await upload(
      await xlsx([
        {
          product_code: 'PETLYA-NEW',
          category_slug: 'furnitura',
          name_uz: 'Petlya dovodchikli',
          name_ru: 'Петля с доводчиком',
          unit: 'PIECE',
          min_qty: 2,
          qty_step: 2,
          weight_kg: 0.1,
          sku: 'GTV-PB-110',
          price: 14_000,
        },
      ]),
      true,
    ).expect(200);
    expect(res.body.summary).toMatchObject({ productsCreated: 0, productsUpdated: 1 });
    const p = await ctx.prisma.product.findUniqueOrThrow({ where: { id: c.hinge.id } });
    expect(p.code).toBe('PETLYA-NEW');
  });

  it('SKU boshqa kodli mahsulotga tegishli bo\'lsa — xato', async () => {
    const res = await upload(await xlsx([kromka({ sku: 'GTV-PB-110' })])).expect(200);
    expect(res.body.errors[0]).toMatchObject({ column: 'sku', message: expect.stringContaining('PETLYA') });
  });
});
