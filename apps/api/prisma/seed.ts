/**
 * Demo ma'lumotlar. Qayta ishga tushirish xavfsiz (upsert).
 * Kirish: OTP_TEST_PHONES dagi raqamlar, kod 000000.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Unit, type ProductKind } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

const USERS = [
  { phone: '+998900000001', fullName: 'Super Admin', role: 'SUPER_ADMIN' },
  { phone: '+998900000002', fullName: 'Menejer ', role: 'MANAGER' },
  { phone: '+998900000003', fullName: 'Omborchi ', role: 'WAREHOUSE' },
  { phone: '+998900000004', fullName: 'Haydovchi ', role: 'DRIVER' },
  { phone: '+998900000005', fullName: 'Usta ', role: 'CUSTOMER' },
] as const;

interface SeedVariant {
  sku: string;
  attributes: Record<string, string | number>;
  price: number;
  stock: number;
  tiers?: [minQty: number, price: number][];
  usta?: number;
  diler?: number;
}

interface SeedProduct {
  code: string;
  category: string;
  brand?: string;
  nameUz: string;
  nameRu: string;
  unit: Unit;
  kind?: ProductKind;
  minQty?: number;
  qtyStep?: number;
  weightKg?: number;
  volumeM3?: number;
  board?: { length: number; width: number; thickness: number };
  variants: SeedVariant[];
}

const CATEGORIES = [
  { slug: 'plitalar', nameUz: 'Plitalar', nameRu: 'Плиты' },
  { slug: 'ldsp', nameUz: 'LDSP', nameRu: 'ЛДСП', parent: 'plitalar' },
  { slug: 'mdf', nameUz: 'MDF', nameRu: 'МДФ', parent: 'plitalar' },
  { slug: 'kromka', nameUz: 'Kromka', nameRu: 'Кромка' },
  { slug: 'furnitura', nameUz: 'Furnitura', nameRu: 'Фурнитура' },
  { slug: 'petlya', nameUz: 'Petlyalar', nameRu: 'Петли', parent: 'furnitura' },
  { slug: 'yonaltiruvchi', nameUz: 'Yo\'naltiruvchilar', nameRu: 'Направляющие', parent: 'furnitura' },
  { slug: 'ruchka', nameUz: 'Ruchkalar', nameRu: 'Ручки', parent: 'furnitura' },
  { slug: 'mahkamlagich', nameUz: 'Mahkamlagichlar', nameRu: 'Крепёж' },
] as const;

const PRODUCTS: SeedProduct[] = [
  {
    code: 'LDSP-KR-16',
    category: 'ldsp',
    brand: 'Kronospan',
    nameUz: 'LDSP Kronospan 16 mm',
    nameRu: 'ЛДСП Kronospan 16 мм',
    unit: 'SHEET',
    kind: 'BOARD',
    weightKg: 45,
    volumeM3: 0.092,
    board: { length: 2800, width: 2070, thickness: 16 },
    variants: [
      { sku: 'KR-W980-16', attributes: { color: 'Oq', decor_code: 'W980', thickness: 16 }, price: 395_000, stock: 120, tiers: [[10, 385_000], [50, 375_000]], usta: 380_000, diler: 368_000 },
      { sku: 'KR-K001-16', attributes: { color: 'Yong\'oq', decor_code: 'K001', thickness: 16 }, price: 445_000, stock: 40, tiers: [[10, 435_000]], usta: 430_000 },
      { sku: 'KR-0190-16', attributes: { color: 'Qora', decor_code: '0190', thickness: 16 }, price: 420_000, stock: 6 },
    ],
  },
  {
    code: 'LDSP-EG-18',
    category: 'ldsp',
    brand: 'Egger',
    nameUz: 'LDSP Egger 18 mm',
    nameRu: 'ЛДСП Egger 18 мм',
    unit: 'SHEET',
    kind: 'BOARD',
    weightKg: 52,
    volumeM3: 0.104,
    board: { length: 2800, width: 2070, thickness: 18 },
    variants: [
      { sku: 'EG-H1145-18', attributes: { color: 'Bardolino eman', decor_code: 'H1145', thickness: 18 }, price: 610_000, stock: 25 },
      { sku: 'EG-U999-18', attributes: { color: 'Qora', decor_code: 'U999', thickness: 18 }, price: 590_000, stock: 0 },
    ],
  },
  {
    code: 'MDF-16',
    category: 'mdf',
    nameUz: 'MDF 16 mm (bo\'yalmagan)',
    nameRu: 'МДФ 16 мм (некрашеный)',
    unit: 'SHEET',
    kind: 'BOARD',
    weightKg: 55,
    volumeM3: 0.094,
    board: { length: 2800, width: 2070, thickness: 16 },
    variants: [{ sku: 'MDF-16', attributes: { thickness: 16 }, price: 340_000, stock: 60 }],
  },
  {
    code: 'KROMKA-PVX-RH',
    category: 'kromka',
    brand: 'Rehau',
    nameUz: 'PVX kromka 2 mm',
    nameRu: 'Кромка ПВХ 2 мм',
    unit: 'METER',
    kind: 'EDGE',
    minQty: 1,
    qtyStep: 0.5,
    weightKg: 0.05,
    volumeM3: 0.0001,
    variants: [
      { sku: 'RH-2-W980', attributes: { color: 'Oq', decor_code: 'W980', thickness: 2, width: 22 }, price: 4_500, stock: 3000, tiers: [[100, 4_200]] },
      { sku: 'RH-2-K001', attributes: { color: 'Yong\'oq', decor_code: 'K001', thickness: 2, width: 22 }, price: 5_000, stock: 1200 },
      { sku: 'RH-04-W980', attributes: { color: 'Oq', decor_code: 'W980', thickness: 0.4, width: 19 }, price: 1_500, stock: 5000 },
    ],
  },
  {
    code: 'PETLYA-BLUM',
    category: 'petlya',
    brand: 'Blum',
    nameUz: 'Petlya Blum Clip top (dovodchikli)',
    nameRu: 'Петля Blum Clip top (с доводчиком)',
    unit: 'PIECE',
    minQty: 2,
    qtyStep: 2,
    weightKg: 0.12,
    volumeM3: 0.0002,
    variants: [{ sku: 'BLUM-71B3550', attributes: { angle: '110°' }, price: 48_000, stock: 400, tiers: [[50, 45_000]], usta: 46_000 }],
  },
  {
    code: 'PETLYA-GTV',
    category: 'petlya',
    brand: 'GTV',
    nameUz: 'Petlya GTV (dovodchikli)',
    nameRu: 'Петля GTV (с доводчиком)',
    unit: 'PIECE',
    minQty: 2,
    qtyStep: 2,
    weightKg: 0.1,
    volumeM3: 0.0002,
    variants: [{ sku: 'GTV-PB-110', attributes: { angle: '110°' }, price: 14_000, stock: 1500, tiers: [[100, 12_500]] }],
  },
  {
    code: 'YONALT-GTV',
    category: 'yonaltiruvchi',
    brand: 'GTV',
    nameUz: 'Sharikli yo\'naltiruvchi',
    nameRu: 'Шариковые направляющие',
    unit: 'SET',
    weightKg: 0.9,
    volumeM3: 0.002,
    variants: [
      { sku: 'GTV-SL-350', attributes: { length: 350 }, price: 38_000, stock: 200 },
      { sku: 'GTV-SL-450', attributes: { length: 450 }, price: 45_000, stock: 180 },
      { sku: 'GTV-SL-500', attributes: { length: 500 }, price: 49_000, stock: 0 },
    ],
  },
  {
    code: 'RUCHKA-128',
    category: 'ruchka',
    nameUz: 'Ruchka profil 128 mm',
    nameRu: 'Ручка профиль 128 мм',
    unit: 'PIECE',
    weightKg: 0.06,
    volumeM3: 0.0001,
    variants: [
      { sku: 'RCH-128-BLK', attributes: { color: 'Qora', length: 128 }, price: 18_000, stock: 300 },
      { sku: 'RCH-128-GLD', attributes: { color: 'Oltin', length: 128 }, price: 22_000, stock: 120 },
    ],
  },
  {
    code: 'KONFIRMAT-7x50',
    category: 'mahkamlagich',
    nameUz: 'Konfirmat 7×50',
    nameRu: 'Конфирмат 7×50',
    unit: 'PACK',
    weightKg: 1.1,
    volumeM3: 0.001,
    variants: [{ sku: 'KONF-7x50-100', attributes: { pack: '100 dona' }, price: 35_000, stock: 90 }],
  },
];

async function main() {
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { phone: u.phone },
      create: { ...u, ...(u.role === 'CUSTOMER' && { customerProfile: { create: { type: 'MASTER' } } }) },
      update: { fullName: u.fullName, role: u.role },
    });
  }

  const usta = await prisma.priceGroup.upsert({ where: { name: 'Usta' }, create: { name: 'Usta' }, update: {} });
  const diler = await prisma.priceGroup.upsert({ where: { name: 'Diler' }, create: { name: 'Diler' }, update: {} });

  const aziz = await prisma.user.findUniqueOrThrow({ where: { phone: '+998900000005' } });
  await prisma.customerProfile.update({
    where: { userId: aziz.id },
    data: {
      priceGroupId: usta.id,
      creditLimit: 10_000_000n,
      paymentTermDays: 15,
      allowedPaymentMethods: ['CASH', 'CARD_TRANSFER', 'BANK_TRANSFER'],
    },
  });

  const categoryIds = new Map<string, string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const parentId = 'parent' in c ? categoryIds.get(c.parent) : undefined;
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, nameUz: c.nameUz, nameRu: c.nameRu, parentId, sortOrder: i },
      update: { nameUz: c.nameUz, nameRu: c.nameRu, parentId, sortOrder: i },
    });
    categoryIds.set(c.slug, row.id);
  }

  for (const p of PRODUCTS) {
    const brand = p.brand
      ? await prisma.brand.upsert({ where: { name: p.brand }, create: { name: p.brand }, update: {} })
      : null;
    const firstSku = p.variants[0]!.sku;
    const existing = await prisma.productVariant.findUnique({ where: { sku: firstSku }, select: { productId: true } });
    const data = {
      code: p.code,
      categoryId: categoryIds.get(p.category)!,
      brandId: brand?.id ?? null,
      nameUz: p.nameUz,
      nameRu: p.nameRu,
      unit: p.unit,
      kind: p.kind ?? 'GOODS',
      minQty: p.minQty ?? 1,
      qtyStep: p.qtyStep ?? 1,
      weightKg: p.weightKg,
      volumeM3: p.volumeM3,
      boardLengthMm: p.board?.length,
      boardWidthMm: p.board?.width,
      thicknessMm: p.board?.thickness,
    };
    const product = existing
      ? await prisma.product.update({ where: { id: existing.productId }, data })
      : await prisma.product.create({ data });

    for (const v of p.variants) {
      const variant = await prisma.productVariant.upsert({
        where: { sku: v.sku },
        create: {
          productId: product.id,
          sku: v.sku,
          attributes: v.attributes,
          basePrice: BigInt(v.price),
          stockQty: v.stock,
          lowStockThreshold: p.unit === 'SHEET' ? 10 : 50,
          availability: v.stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
        },
        update: { attributes: v.attributes, basePrice: BigInt(v.price) },
      });
      await prisma.variantPriceTier.deleteMany({ where: { variantId: variant.id } });
      if (v.tiers?.length) {
        await prisma.variantPriceTier.createMany({
          data: v.tiers.map(([minQty, price]) => ({ variantId: variant.id, minQty, price: BigInt(price) })),
        });
      }
      await prisma.variantGroupPrice.deleteMany({ where: { variantId: variant.id } });
      const groupPrices = [
        ...(v.usta ? [{ priceGroupId: usta.id, price: BigInt(v.usta) }] : []),
        ...(v.diler ? [{ priceGroupId: diler.id, price: BigInt(v.diler) }] : []),
      ];
      if (groupPrices.length) {
        await prisma.variantGroupPrice.createMany({ data: groupPrices.map((g) => ({ ...g, variantId: variant.id })) });
      }
    }
  }

  if ((await prisma.warehouse.count()) === 0) {
    await prisma.warehouse.create({
      data: {
        name: 'Asosiy ombor (Sergeli)',
        addressText: 'Toshkent, Sergeli tumani, Yangi Sergeli ko\'chasi',
        lat: 41.2275,
        lng: 69.2205,
        phone: '+998712000000',
        workHours: 'Du–Sha 08:00–18:00',
      },
    });
  }

  const vehicles = [
    { code: 'DAMAS', name: 'Damas', maxWeightKg: 500, maxVolumeM3: 2.5, maxLengthMm: 1900, sortOrder: 1 },
    { code: 'LABO', name: 'Labo', maxWeightKg: 800, maxVolumeM3: 4, maxLengthMm: 2900, sortOrder: 2 },
    { code: 'ISUZU', name: 'Isuzu', maxWeightKg: 3500, maxVolumeM3: 18, maxLengthMm: 4300, sortOrder: 3 },
  ];
  for (const v of vehicles) {
    await prisma.vehicleType.upsert({ where: { code: v.code }, create: v, update: v });
  }

  const settings: Record<string, unknown> = {
    'payment.card': { number: '8600 0000 0000 0000', holder: 'MEBEL ORDER MCHJ' },
    'payment.bank': { name: 'Kapitalbank', account: '20208000000000000001', mfo: '01158', inn: '300000000' },
    'quote.ttl_hours': 24,
    'cutting.price_per_meter': 3_000,
    'cutting.edging_price_per_meter': 2_500,
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({ where: { key }, create: { key, value: value as object }, update: {} });
  }

  const counts = {
    users: await prisma.user.count(),
    categories: await prisma.category.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
  };
  console.log('Seed tayyor:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
