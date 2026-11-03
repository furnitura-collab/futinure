import { execSync } from 'node:child_process';
import pg from 'pg';
import { TEST_DB_URL } from './test-env.js';

/** mebel_test bazasini yaratadi (bo'lmasa) va migratsiyalarni qo'llaydi */
export default async function setup() {
  const admin = new pg.Client({ connectionString: TEST_DB_URL.replace('/mebel_test', '/mebel') });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'mebel_test'");
  if (!rowCount) await admin.query('CREATE DATABASE mebel_test');
  await admin.end();

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: 'pipe',
  });
}
