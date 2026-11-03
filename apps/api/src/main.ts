import 'dotenv/config';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';
import { ENV, type Env } from './config/env.js';
import { serveWeb } from './web.js';

async function bootstrap() {
  const app = setupApp(await NestFactory.create<NestExpressApplication>(AppModule));
  // Reverse proxy (nginx) orqasida haqiqiy IP — OTP rate limit uchun
  app.set('trust proxy', 1);
  const env = app.get<Env>(ENV);
  if (env.WEB_DIR) serveWeb(app, env.WEB_DIR);
  await app.listen(env.PORT);
  Logger.log(`API: http://localhost:${env.PORT}/api/v1`, 'Bootstrap');
}

void bootstrap();
