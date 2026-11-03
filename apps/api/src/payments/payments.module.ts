import { Module } from '@nestjs/common';
import { AdminCustomersService } from '../customers/admin-customers.service.js';
import { CustomerFinanceService } from '../customers/customer-finance.service.js';
import { OrdersModule } from '../orders/orders.module.js';
import { AdminPaymentsController, CustomerPaymentsController, PaymentReceiptController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [OrdersModule],
  controllers: [CustomerPaymentsController, PaymentReceiptController, AdminPaymentsController],
  providers: [PaymentsService, CustomerFinanceService, AdminCustomersService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
