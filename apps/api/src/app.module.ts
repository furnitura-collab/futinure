import { Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.service.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { ConfigModule } from './config/config.module.js';
import { LedgerModule } from './ledger/ledger.service.js';
import { HealthController } from './health/health.controller.js';
import { MeController } from './me/me.controller.js';
import { MeService } from './me/me.service.js';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { DeliveriesModule } from './deliveries/deliveries.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RedisModule } from './redis/redis.module.js';
import { ChatModule } from './chat/chat.module.js';
import { OutboxModule } from './events/outbox.service.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { UploadsModule } from './uploads/uploads.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    AuditModule,
    LedgerModule,
    OutboxModule,
    AuthModule,
    UploadsModule,
    NotificationsModule,
    CatalogModule,
    OrdersModule,
    PaymentsModule,
    DeliveriesModule,
    ChatModule,
  ],
  controllers: [HealthController, MeController],
  providers: [MeService],
})
export class AppModule {}
