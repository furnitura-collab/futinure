import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  pricingQuoteSchema,
  productListQuerySchema,
  type PricingQuoteInput,
  type ProductListQuery,
} from '@mebel/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthedRequest, Public } from '../auth/decorators.js';
import { CatalogService } from './catalog.service.js';

/**
 * Login ixtiyoriy. Token bo'lsa mijozning guruh narxi qo'llanadi.
 */
@Public()
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('categories')
  categories() {
    return this.catalog.categories();
  }

  @Get('brands')
  brands() {
    return this.catalog.brands();
  }

  @Get('products')
  list(@Query(new ZodPipe(productListQuerySchema)) query: ProductListQuery, @Req() req: AuthedRequest) {
    return this.catalog.list(query, req.user?.id ?? null);
  }

  @Get('products/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: AuthedRequest) {
    return this.catalog.detail(id, req.user?.id ?? null);
  }

  @Get('variants/by-sku/:sku')
  bySku(@Param('sku') sku: string, @Req() req: AuthedRequest) {
    return this.catalog.bySku(sku, req.user?.id ?? null);
  }

  @Post('pricing/quote')
  @HttpCode(200)
  quote(@Body(new ZodPipe(pricingQuoteSchema)) body: PricingQuoteInput, @Req() req: AuthedRequest) {
    return this.catalog.quote(body, req.user?.id ?? null);
  }
}
