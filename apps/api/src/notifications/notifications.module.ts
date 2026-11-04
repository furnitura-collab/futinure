import { Body, Controller, Get, Global, HttpCode, Module, Post, Query } from '@nestjs/common';
import { notificationsReadSchema, paginationSchema, type NotificationsReadInput } from '@mebel/shared';
import type { PageQuery } from '../common/pagination.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { type AuthUser, CurrentUser } from '../auth/decorators.js';
import { ENV, type Env } from '../config/env.js';
import { OUTBOX_HANDLER, OutboxDispatcher } from '../events/outbox.dispatcher.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { DebtReminderScheduler } from './debt-reminder.scheduler.js';
import { EventRouter } from './event-router.js';
import { NotificationsService } from './notifications.service.js';
import {
  BotTelegramSender,
  ConsolePushSender,
  ConsoleTelegramSender,
  ExpoPushSender,
  PushSender,
  TelegramSender,
} from './senders.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(paginationSchema)) q: PageQuery) {
    return this.notifications.list(u.id, q.page, q.limit);
  }

  @Post('read')
  @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Body(new ZodPipe(notificationsReadSchema)) body: NotificationsReadInput) {
    return this.notifications.markRead(u.id, body.all ? undefined : body.ids);
  }
}

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    RealtimeService,
    RealtimeGateway,
    NotificationsService,
    EventRouter,
    OutboxDispatcher,
    DebtReminderScheduler,
    { provide: OUTBOX_HANDLER, useExisting: EventRouter },
    ConsolePushSender,
    ExpoPushSender,
    {
      provide: PushSender,
      inject: [ENV, ConsolePushSender, ExpoPushSender],
      useFactory: (env: Env, c: ConsolePushSender, e: ExpoPushSender) => (env.PUSH_PROVIDER === 'expo' ? e : c),
    },
    ConsoleTelegramSender,
    BotTelegramSender,
    {
      provide: TelegramSender,
      inject: [ENV, ConsoleTelegramSender, BotTelegramSender],
      useFactory: (env: Env, c: ConsoleTelegramSender, b: BotTelegramSender) => (env.TELEGRAM_BOT_TOKEN ? b : c),
    },
  ],
  exports: [RealtimeService, NotificationsService, OutboxDispatcher, DebtReminderScheduler],
})
export class NotificationsModule {}
