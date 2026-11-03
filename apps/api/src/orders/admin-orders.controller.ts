import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  adminOrderListQuerySchema,
  assignOrderSchema,
  quoteInputSchema,
  transitionSchema,
  type AdminOrderListQuery,
  type AssignOrderInput,
  type QuoteInput,
  type TransitionInput,
} from '@mebel/shared';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser, Roles } from '../auth/decorators.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { OrderQuotesService } from './order-quotes.service.js';
import { OrderWorkflowService } from './order-workflow.service.js';

const uuid = new ParseUUIDPipe();

@Roles('MANAGER', 'SUPER_ADMIN')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly orders: AdminOrdersService,
    private readonly quotes: OrderQuotesService,
    private readonly workflow: OrderWorkflowService,
  ) {}

  @Get()
  list(@Query(new ZodPipe(adminOrderListQuerySchema)) query: AdminOrderListQuery) {
    return this.orders.list(query);
  }

  @Get('kanban')
  kanban(@Query(new ZodPipe(adminOrderListQuerySchema)) query: AdminOrderListQuery) {
    return this.orders.kanban(query);
  }

  @Get('managers')
  managers() {
    return this.orders.managers();
  }

  @Get(':id')
  detail(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    return this.orders.detail(id, u);
  }

  @Patch(':id/assign')
  assign(@Param('id', uuid) id: string, @Body(new ZodPipe(assignOrderSchema)) body: AssignOrderInput, @CurrentUser() u: AuthUser) {
    return this.orders.assign(id, body.managerId, u);
  }

  @Post(':id/quotes')
  async quote(@Param('id', uuid) id: string, @Body(new ZodPipe(quoteInputSchema)) body: QuoteInput, @CurrentUser() u: AuthUser) {
    const { quote, warnings } = await this.quotes.create(id, body, u);
    return { quote, warnings, order: await this.orders.detail(id, u) };
  }

  /**
   * Barcha status o'tishlari. Omborchi va haydovchi ham ishlatadi —
   * kim nima qila olishini state machine hal qiladi.
   */
  @Roles('MANAGER', 'SUPER_ADMIN', 'WAREHOUSE', 'DRIVER')
  @Post(':id/transition')
  @HttpCode(200)
  async transition(@Param('id', uuid) id: string, @Body(new ZodPipe(transitionSchema)) body: TransitionInput, @CurrentUser() u: AuthUser) {
    await this.workflow.transition(id, body, u);
    return this.orders.detail(id, u);
  }
}
