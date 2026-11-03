import { Module } from '@nestjs/common';
import { AddressesController, WarehousesController } from '../addresses/addresses.controller.js';
import { CartController, FavoritesController } from '../cart/cart.controller.js';
import { CartService } from '../cart/cart.service.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { OrderInventoryService } from './order-inventory.service.js';
import { OrderQuotesService } from './order-quotes.service.js';
import { OrderStateMachine } from './order-state-machine.service.js';
import { OrderWorkflowService } from './order-workflow.service.js';
import { QuoteExpiryScheduler } from './quote-expiry.scheduler.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [CatalogModule],
  controllers: [
    CartController,
    FavoritesController,
    AddressesController,
    WarehousesController,
    OrdersController,
    AdminOrdersController,
  ],
  providers: [
    CartService,
    OrdersService,
    OrderStateMachine,
    OrderInventoryService,
    OrderQuotesService,
    OrderWorkflowService,
    AdminOrdersService,
    QuoteExpiryScheduler,
  ],
  exports: [OrderStateMachine, OrderWorkflowService, CartService, AdminOrdersService],
})
export class OrdersModule {}
