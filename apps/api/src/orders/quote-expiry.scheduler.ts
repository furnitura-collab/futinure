import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { OrderQuotesService } from './order-quotes.service.js';

const INTERVAL_MS = 60_000;

/**
 * Har daqiqada muddati o'tgan takliflarni yopadi (QUOTED → NEW).
 * Bir nechta API nusxasi ishlasa ham xavfsiz: har taklif qulf ostida, faqat bir marta yopiladi.
 * Testlarda o'chiq — u yerda expireDue() to'g'ridan-to'g'ri chaqiriladi.
 */
@Injectable()
export class QuoteExpiryScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(QuoteExpiryScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly quotes: OrderQuotesService,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const n = await this.quotes.expireDue();
      if (n) this.logger.log(`${n} ta taklif muddati o'tdi`);
    } catch (e) {
      this.logger.error('Takliflarni yopishda xato', e as Error);
    } finally {
      this.running = false;
    }
  }
}
