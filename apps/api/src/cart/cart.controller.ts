import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { cartBulkAddSchema, cartItemSchema, type CartBulkAddInput, type CartItemInput } from '@mebel/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { AppException } from '../common/app-exception.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CartService } from './cart.service.js';

const uuid = new ParseUUIDPipe();

@Roles('CUSTOMER')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  view(@CurrentUser() u: AuthUser) {
    return this.cart.view(u.id);
  }

  @Put('items/:variantId')
  set(@CurrentUser() u: AuthUser, @Param('variantId', uuid) variantId: string, @Body(new ZodPipe(cartItemSchema)) body: CartItemInput) {
    return this.cart.setItem(u.id, variantId, body.qty);
  }

  @Delete('items/:variantId')
  remove(@CurrentUser() u: AuthUser, @Param('variantId', uuid) variantId: string) {
    return this.cart.removeItem(u.id, variantId);
  }

  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() u: AuthUser) {
    await this.cart.clear(u.id);
  }

  @Post('items/bulk')
  @HttpCode(200)
  bulk(@CurrentUser() u: AuthUser, @Body(new ZodPipe(cartBulkAddSchema)) body: CartBulkAddInput) {
    return this.cart.bulkAdd(u.id, body);
  }

  @Post('reorder/:orderId')
  @HttpCode(200)
  reorder(@CurrentUser() u: AuthUser, @Param('orderId', uuid) orderId: string) {
    return this.cart.reorder(u.id, orderId);
  }
}

@Roles('CUSTOMER')
@Controller('favorites')
export class FavoritesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
  ) {}

  @Get()
  async list(@CurrentUser() u: AuthUser) {
    const favs = await this.prisma.favorite.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
    // Nofaol bo'lib qolgan mahsulotlar kartochkaga tushmaydi
    return this.catalog.cards(
      favs.map((f) => f.productId),
      u.id,
    );
  }

  @Put(':productId')
  @HttpCode(204)
  async add(@CurrentUser() u: AuthUser, @Param('productId', uuid) productId: string) {
    if (!(await this.prisma.product.count({ where: { id: productId, isActive: true } }))) {
      throw AppException.notFound('Mahsulot');
    }
    await this.prisma.favorite.upsert({
      where: { userId_productId: { userId: u.id, productId } },
      create: { userId: u.id, productId },
      update: {},
    });
  }

  @Delete(':productId')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthUser, @Param('productId', uuid) productId: string) {
    await this.prisma.favorite.deleteMany({ where: { userId: u.id, productId } });
  }
}
