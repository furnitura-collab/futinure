import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import {
  adminProductListQuerySchema,
  brandInputSchema,
  bulkPriceSchema,
  categoryInputSchema,
  categoryUpdateSchema,
  groupPricesSchema,
  imageInputSchema,
  importCommitQuerySchema,
  paginationSchema,
  priceGroupInputSchema,
  priceTiersSchema,
  productInputSchema,
  productUpdateSchema,
  stockMovementInputSchema,
  variantInputSchema,
  variantUpdateSchema,
  type AdminProductListQuery,
  type BrandInput,
  type BulkPriceInput,
  type CategoryInput,
  type CategoryUpdate,
  type GroupPricesInput,
  type ImageInput,
  type PriceGroupInput,
  type PriceTiersInput,
  type ProductInput,
  type ProductUpdate,
  type StockMovementInput,
  type VariantInput,
  type VariantUpdate,
} from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { BulkPriceService } from './bulk-price.service.js';
import { CatalogExportService } from './excel/catalog-export.service.js';
import { CatalogImportService } from './excel/catalog-import.service.js';
import { StockService } from './stock.service.js';

const uuid = new ParseUUIDPipe();
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

@Roles('MANAGER', 'SUPER_ADMIN')
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly catalog: AdminCatalogService,
    private readonly bulk: BulkPriceService,
    private readonly importer: CatalogImportService,
    private readonly exporter: CatalogExportService,
  ) {}

  // ───── Kategoriyalar ─────
  @Get('categories')
  categories() {
    return this.catalog.categories();
  }

  @Post('categories')
  createCategory(@Body(new ZodPipe(categoryInputSchema)) body: CategoryInput, @CurrentUser() u: AuthUser) {
    return this.catalog.createCategory(body, u);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id', uuid) id: string, @Body(new ZodPipe(categoryUpdateSchema)) body: CategoryUpdate, @CurrentUser() u: AuthUser) {
    return this.catalog.updateCategory(id, body, u);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  async deleteCategory(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    await this.catalog.deleteCategory(id, u);
  }

  // ───── Brendlar ─────
  @Get('brands')
  brands() {
    return this.catalog.brands();
  }

  @Post('brands')
  createBrand(@Body(new ZodPipe(brandInputSchema)) body: BrandInput) {
    return this.catalog.createBrand(body);
  }

  @Patch('brands/:id')
  updateBrand(@Param('id', uuid) id: string, @Body(new ZodPipe(brandInputSchema.partial())) body: Partial<BrandInput>) {
    return this.catalog.updateBrand(id, body);
  }

  @Delete('brands/:id')
  @HttpCode(204)
  async deleteBrand(@Param('id', uuid) id: string) {
    await this.catalog.deleteBrand(id);
  }

  // ───── Narx guruhlari (faqat super admin o'zgartiradi) ─────
  @Get('price-groups')
  priceGroups() {
    return this.catalog.priceGroups();
  }

  @Roles('SUPER_ADMIN')
  @Post('price-groups')
  createPriceGroup(@Body(new ZodPipe(priceGroupInputSchema)) body: PriceGroupInput) {
    return this.catalog.createPriceGroup(body);
  }

  @Roles('SUPER_ADMIN')
  @Patch('price-groups/:id')
  updatePriceGroup(@Param('id', uuid) id: string, @Body(new ZodPipe(priceGroupInputSchema.partial())) body: Partial<PriceGroupInput>) {
    return this.catalog.updatePriceGroup(id, body);
  }

  @Roles('SUPER_ADMIN')
  @Delete('price-groups/:id')
  @HttpCode(204)
  async deletePriceGroup(@Param('id', uuid) id: string) {
    await this.catalog.deletePriceGroup(id);
  }

  // ───── Mahsulotlar ─────
  // Omborchi ham ko'radi (kirim/inventarizatsiya uchun tovar qidirish), o'zgartira olmaydi
  @Roles('MANAGER', 'SUPER_ADMIN', 'WAREHOUSE')
  @Get('products')
  products(@Query(new ZodPipe(adminProductListQuerySchema)) query: AdminProductListQuery) {
    return this.catalog.products(query);
  }

  @Roles('MANAGER', 'SUPER_ADMIN', 'WAREHOUSE')
  @Get('products/:id')
  product(@Param('id', uuid) id: string) {
    return this.catalog.product(id);
  }

  @Post('products')
  createProduct(@Body(new ZodPipe(productInputSchema)) body: ProductInput, @CurrentUser() u: AuthUser) {
    return this.catalog.createProduct(body, u);
  }

  @Patch('products/:id')
  updateProduct(@Param('id', uuid) id: string, @Body(new ZodPipe(productUpdateSchema)) body: ProductUpdate, @CurrentUser() u: AuthUser) {
    return this.catalog.updateProduct(id, body, u);
  }

  @Roles('SUPER_ADMIN')
  @Delete('products/:id')
  @HttpCode(204)
  async deleteProduct(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    await this.catalog.deleteProduct(id, u);
  }

  // ───── Variantlar ─────
  @Post('products/:id/variants')
  createVariant(@Param('id', uuid) id: string, @Body(new ZodPipe(variantInputSchema)) body: VariantInput, @CurrentUser() u: AuthUser) {
    return this.catalog.createVariant(id, body, u);
  }

  @Patch('variants/:id')
  updateVariant(@Param('id', uuid) id: string, @Body(new ZodPipe(variantUpdateSchema)) body: VariantUpdate, @CurrentUser() u: AuthUser) {
    return this.catalog.updateVariant(id, body, u);
  }

  @Roles('SUPER_ADMIN')
  @Delete('variants/:id')
  @HttpCode(204)
  async deleteVariant(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    await this.catalog.deleteVariant(id, u);
  }

  @Put('variants/:id/price-tiers')
  setTiers(@Param('id', uuid) id: string, @Body(new ZodPipe(priceTiersSchema)) body: PriceTiersInput, @CurrentUser() u: AuthUser) {
    return this.catalog.setPriceTiers(id, body, u);
  }

  @Put('variants/:id/group-prices')
  setGroupPrices(@Param('id', uuid) id: string, @Body(new ZodPipe(groupPricesSchema)) body: GroupPricesInput, @CurrentUser() u: AuthUser) {
    return this.catalog.setGroupPrices(id, body, u);
  }

  @Get('variants/:id/price-history')
  priceHistory(@Param('id', uuid) id: string) {
    return this.catalog.priceHistory(id);
  }

  // ───── Rasmlar ─────
  @Post('products/:id/images')
  addImage(@Param('id', uuid) id: string, @Body(new ZodPipe(imageInputSchema)) body: ImageInput) {
    return this.catalog.addImage(id, body);
  }

  @Put('products/:id/images/order')
  @HttpCode(204)
  async reorderImages(@Param('id', uuid) id: string, @Body(new ZodPipe(z.object({ ids: z.array(z.uuid()).max(50) }))) body: { ids: string[] }) {
    await this.catalog.reorderImages(id, body.ids);
  }

  @Delete('products/:id/images/:imageId')
  @HttpCode(204)
  async deleteImage(@Param('id', uuid) id: string, @Param('imageId', uuid) imageId: string) {
    await this.catalog.deleteImage(id, imageId);
  }

  // ───── Ommaviy narx, import/eksport ─────
  @Roles('SUPER_ADMIN')
  @Post('prices/bulk-update')
  @HttpCode(200)
  bulkPrice(@Body(new ZodPipe(bulkPriceSchema)) body: BulkPriceInput, @CurrentUser() u: AuthUser) {
    return this.bulk.run(body, u);
  }

  @Post('catalog/import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } }))
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query(new ZodPipe(importCommitQuerySchema)) query: { commit: boolean },
    @CurrentUser() u: AuthUser,
  ) {
    if (!file) throw new AppException('FILE_REQUIRED', '"file" maydoni bo\'sh', HttpStatus.UNPROCESSABLE_ENTITY);
    return this.importer.import(file.buffer, query.commit, u);
  }

  @Get('catalog/export.xlsx')
  async export(@Res() res: Response) {
    const buf = await this.exporter.export();
    const date = new Date().toISOString().slice(0, 10);
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .attachment(`katalog-${date}.xlsx`)
      .send(buf);
  }
}

/** Ombor: omborchi ham kirim/inventarizatsiya qila oladi */
@Roles('MANAGER', 'SUPER_ADMIN', 'WAREHOUSE')
@Controller('admin/stock')
export class AdminStockController {
  constructor(private readonly stock: StockService) {}

  @Post('movements')
  move(@Body(new ZodPipe(stockMovementInputSchema)) body: StockMovementInput, @CurrentUser() u: AuthUser) {
    return this.stock.move(body, u);
  }

  @Get('low')
  low() {
    return this.stock.lowStock();
  }

  @Get('variants/:id/movements')
  movements(@Param('id', uuid) id: string, @Query(new ZodPipe(paginationSchema)) q: { page: number; limit: number }) {
    return this.stock.movements(id, q.page, q.limit);
  }
}
