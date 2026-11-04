import type { Role } from '@mebel/shared';
import { TokenService } from '../src/auth/token.service.js';
import type { TestContext } from './app.js';

let phoneSeq = 0;

/** OTP'siz foydalanuvchi + token (testlarni tezlashtirish uchun) */
export async function userWithToken(ctx: TestContext, role: Role, opts: { priceGroupId?: string } = {}) {
  phoneSeq++;
  const user = await ctx.prisma.user.create({
    data: {
      phone: `+99893${String(phoneSeq).padStart(7, '0')}`,
      role,
      fullName: `${role} ${phoneSeq}`,
      ...(role === 'CUSTOMER' && { customerProfile: { create: { priceGroupId: opts.priceGroupId ?? null } } }),
    },
  });
  const { accessToken, refreshToken } = await ctx.app.get(TokenService).issue(user);
  return { user, token: accessToken, refreshToken, auth: { Authorization: `Bearer ${accessToken}` } };
}

/**
 * Kichik katalog:
 *   plitalar > ldsp : LDSP 16 (W980 — 120 dona, pog'onalar, usta narxi; 0190 — 6 dona, kam)
 *   furnitura      : Petlya (min 2, qadam 2, 400 dona), Yo'naltiruvchi 500 (0 dona, buyurtma asosida)
 *   arxiv (nofaol) : Eski mahsulot
 */
export async function seedCatalog(ctx: TestContext) {
  const p = ctx.prisma;
  const usta = await p.priceGroup.create({ data: { name: 'Usta' } });
  const plitalar = await p.category.create({ data: { slug: 'plitalar', nameUz: 'Plitalar', nameRu: 'Плиты' } });
  const ldsp = await p.category.create({ data: { slug: 'ldsp', nameUz: 'LDSP', nameRu: 'ЛДСП', parentId: plitalar.id } });
  const furnitura = await p.category.create({ data: { slug: 'furnitura', nameUz: 'Furnitura', nameRu: 'Фурнитура' } });
  const arxiv = await p.category.create({ data: { slug: 'arxiv', nameUz: 'Arxiv', nameRu: 'Архив', isActive: false } });
  const kronospan = await p.brand.create({ data: { name: 'Kronospan' } });

  const board = await p.product.create({
    data: {
      code: 'LDSP-16',
      categoryId: ldsp.id,
      brandId: kronospan.id,
      nameUz: 'LDSP Kronospan 16 mm',
      nameRu: 'ЛДСП Kronospan 16 мм',
      unit: 'SHEET',
      kind: 'BOARD',
      weightKg: 45,
      volumeM3: 0.092,
      boardLengthMm: 2800,
      boardWidthMm: 2070,
      thicknessMm: 16,
    },
  });
  const white = await p.productVariant.create({
    data: {
      productId: board.id,
      sku: 'KR-W980-16',
      attributes: { color: 'Oq', decor_code: 'W980' },
      basePrice: 395_000n,
      stockQty: 120,
      lowStockThreshold: 10,
      priceTiers: { create: [{ minQty: 10, price: 385_000n }, { minQty: 50, price: 375_000n }] },
      groupPrices: { create: [{ priceGroupId: usta.id, price: 380_000n }] },
    },
  });
  const black = await p.productVariant.create({
    data: {
      productId: board.id,
      sku: 'KR-0190-16',
      attributes: { color: 'Qora', decor_code: '0190' },
      basePrice: 420_000n,
      stockQty: 6,
      lowStockThreshold: 10,
    },
  });

  const hinge = await p.product.create({
    data: {
      code: 'PETLYA',
      categoryId: furnitura.id,
      nameUz: 'Petlya dovodchikli',
      nameRu: 'Петля с доводчиком',
      unit: 'PIECE',
      minQty: 2,
      qtyStep: 2,
      weightKg: 0.1,
    },
  });
  const hingeV = await p.productVariant.create({
    data: { productId: hinge.id, sku: 'GTV-PB-110', basePrice: 14_000n, stockQty: 400, lowStockThreshold: 50 },
  });

  const slide = await p.product.create({
    data: { code: 'SLIDE', categoryId: furnitura.id, nameUz: 'Sharikli yo\'naltiruvchi', nameRu: 'Направляющие', unit: 'SET' },
  });
  const slideV = await p.productVariant.create({
    data: { productId: slide.id, sku: 'GTV-SL-500', basePrice: 49_000n, availability: 'ON_ORDER', leadTimeDays: 7 },
  });

  const old = await p.product.create({
    data: { code: 'OLD', categoryId: arxiv.id, nameUz: 'Eski mahsulot', nameRu: 'Старый товар', unit: 'PIECE' },
  });
  await p.productVariant.create({ data: { productId: old.id, sku: 'OLD-1', basePrice: 1000n, stockQty: 5 } });

  return { usta, plitalar, ldsp, furnitura, arxiv, kronospan, board, white, black, hinge, hingeV, slide, slideV, old };
}

export async function seedWarehouse(ctx: TestContext) {
  return ctx.prisma.warehouse.create({
    data: { name: 'Asosiy ombor', addressText: 'Toshkent, Sergeli', lat: 41.22, lng: 69.22 },
  });
}

export async function seedAddress(ctx: TestContext, userId: string) {
  return ctx.prisma.address.create({
    data: { userId, label: 'Sex', addressText: 'Toshkent, Chilonzor 5-kvartal', lat: 41.28, lng: 69.2, floor: 2 },
  });
}
