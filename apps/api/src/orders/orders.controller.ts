import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  rejectQuoteSchema,
  type RejectQuoteInput,
  cancelOrderSchema,
  createOrderSchema,
  IDEMPOTENCY_KEY_RE,
  orderListQuerySchema,
  type CancelOrderInput,
  type CreateOrderInput,
  type OrderListQuery,
} from '@mebel/shared';
import { AppException } from '../common/app-exception.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { OrderQuotesService } from './order-quotes.service.js';
import { OrdersService } from './orders.service.js';

const uuid = new ParseUUIDPipe();

@Roles('CUSTOMER')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly quotes: OrderQuotesService,
  ) {}

  /**
   * Header `Idempotency-Key` majburiy: ilova har "Buyurtma berish" bosilishida bitta kalit yaratadi
   * va tarmoq xatosida aynan shu kalit bilan qayta yuboradi.
   */
  @Post()
  async create(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput,
    @Headers('idempotency-key') key: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!key || !IDEMPOTENCY_KEY_RE.test(key)) {
      throw new AppException('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header kerak (8–64 belgi)', HttpStatus.BAD_REQUEST);
    }
    const { order, replayed } = await this.orders.create(u, body, key);
    res.status(replayed ? HttpStatus.OK : HttpStatus.CREATED);
    if (replayed) res.setHeader('Idempotent-Replayed', 'true');
    return order;
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(orderListQuerySchema)) query: OrderListQuery) {
    return this.orders.list(u.id, query);
  }

  @Get(':id')
  detail(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.orders.detail(u.id, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Body(new ZodPipe(cancelOrderSchema)) body: CancelOrderInput) {
    return this.orders.cancel(u, id, body.reason);
  }

  @Get(':id/quotes')
  quoteHistory(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string) {
    return this.orders.quotes(u.id, id);
  }

  @Post(':id/quotes/:quoteId/accept')
  @HttpCode(200)
  async accept(@CurrentUser() u: AuthUser, @Param('id', uuid) id: string, @Param('quoteId', uuid) quoteId: string) {
    await this.quotes.accept(u, id, quoteId);
    return this.orders.detail(u.id, id);
  }

  @Post(':id/quotes/:quoteId/reject')
  @HttpCode(200)
  async reject(
    @CurrentUser() u: AuthUser,
    @Param('id', uuid) id: string,
    @Param('quoteId', uuid) quoteId: string,
    @Body(new ZodPipe(rejectQuoteSchema)) body: RejectQuoteInput,
  ) {
    await this.quotes.reject(u, id, quoteId, body.comment);
    return this.orders.detail(u.id, id);
  }
}
