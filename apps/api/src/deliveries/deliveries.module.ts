import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { AdminDeliveriesController, DriverController } from './deliveries.controller.js';
import { DeliveriesService } from './deliveries.service.js';

@Module({
  imports: [OrdersModule, PaymentsModule],
  controllers: [AdminDeliveriesController, DriverController],
  providers: [DeliveriesService],
})
export class DeliveriesModule {}
