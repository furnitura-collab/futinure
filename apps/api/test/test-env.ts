import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEST_DB_URL = 'postgresql://mebel:mebel@localhost:5433/mebel_test?schema=public';

export const TEST_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: TEST_DB_URL,
  // Redis 1-baza — dev ma'lumotlariga tegmaydi
  REDIS_URL: 'redis://localhost:6380/1',
  JWT_ACCESS_SECRET: 'test-access-secret-test-access-secret-0123',
  JWT_ACCESS_TTL: '15m',
  OTP_PEPPER: 'test-otp-pepper-test-otp-pepper-test-0123',
  SMS_PROVIDER: 'console',
  OTP_TEST_PHONES: '+998900000001',
  UPLOAD_DIR: join(tmpdir(), 'mebel-test-uploads'),
} as const;
