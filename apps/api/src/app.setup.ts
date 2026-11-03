import { resolve } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { SerializeInterceptor } from './common/serialize.interceptor.js';
import { ENV, type Env } from './config/env.js';
import { RedisIoAdapter } from './realtime/redis-io.adapter.js';

/** main.ts va e2e testlar bir xil sozlamani ishlatadi */
export function setupApp(app: NestExpressApplication) {
  const env = app.get<Env>(ENV);
  app.setGlobalPrefix('api/v1');
  app.useWebSocketAdapter(new RedisIoAdapter(app, env.REDIS_URL));
  // Faqat katalog rasmlari ochiq. UPLOAD_DIR/private (to'lov cheklari) hech qachon statik berilmaydi.
  // Production'da nginx/S3 beradi
  app.useStaticAssets(resolve(env.UPLOAD_DIR, 'catalog'), {
    prefix: '/uploads/catalog/',
    index: false,
    dotfiles: 'deny',
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new SerializeInterceptor());
  app.enableCors();
  app.enableShutdownHooks();
  return app;
}
