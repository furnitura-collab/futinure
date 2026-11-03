import { z } from 'zod';
import { normalizeUzPhone } from '@mebel/shared';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    OTP_PEPPER: z.string().min(32),
    SMS_PROVIDER: z.enum(['console', 'eskiz']).default('console'),
    ESKIZ_EMAIL: z.string().optional(),
    ESKIZ_PASSWORD: z.string().optional(),
    ESKIZ_FROM: z.string().default('4546'),
    OTP_TEST_PHONES: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((p) => normalizeUzPhone(p))
          .filter((p): p is string => p !== null),
      ),
    UPLOAD_DIR: z.string().default('./uploads'),
    /** Push: "console" (dev, logga) yoki "expo" */
    PUSH_PROVIDER: z.enum(['console', 'expo']).default('console'),
    EXPO_ACCESS_TOKEN: z.string().optional(),
    /** Telegram bot — xodimlar guruhiga xabar. Bo'sh bo'lsa o'chiq */
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_CHAT_ID: z.string().optional(),
    /** Telegram xabaridagi havolalar uchun */
    ADMIN_URL: z.string().url().default('http://localhost:3001'),
    /** Sinov serveri: production'da ham console SMS va test raqamlarga ruxsat */
    DEMO_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Build qilingan web fayllar (admin/ va app/). Berilsa API ularni o'zi beradi */
    WEB_DIR: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.DEMO_MODE) {
      if (env.SMS_PROVIDER === 'console') {
        ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'production uchun haqiqiy SMS provayder kerak' });
      }
      if (env.OTP_TEST_PHONES.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['OTP_TEST_PHONES'], message: 'production\'da test raqamlar bo\'lmasligi kerak' });
      }
      if (env.JWT_ACCESS_SECRET.startsWith('change-me')) {
        ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'default secret ishlatilmoqda' });
      }
    }
    if (!!env.TELEGRAM_BOT_TOKEN !== !!env.TELEGRAM_CHAT_ID) {
      ctx.addIssue({ code: 'custom', path: ['TELEGRAM_CHAT_ID'], message: 'TELEGRAM_BOT_TOKEN va TELEGRAM_CHAT_ID birga beriladi' });
    }
    if (env.SMS_PROVIDER === 'eskiz' && (!env.ESKIZ_EMAIL || !env.ESKIZ_PASSWORD)) {
      ctx.addIssue({ code: 'custom', path: ['ESKIZ_EMAIL'], message: 'Eskiz login ma\'lumotlari kerak' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Env xato:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

/** DI token */
export const ENV = Symbol('ENV');
