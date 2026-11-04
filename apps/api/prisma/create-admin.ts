/**
 * Production: ADMIN_PHONE raqamli super admin (bo'lmasa yaratadi, bor bo'lsa tegmaydi).
 * Demo ma'lumotlarsiz toza bazaga birinchi kirish uchun.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizeUzPhone } from '@mebel/shared';
import { PrismaClient } from '../src/generated/prisma/client.js';

const phone = normalizeUzPhone(process.env.ADMIN_PHONE ?? '');
if (!phone) {
  console.error(`ADMIN_PHONE noto'g'ri: "${process.env.ADMIN_PHONE ?? ''}"`);
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
await prisma.user.upsert({
  where: { phone },
  create: { phone, fullName: process.env.ADMIN_NAME || 'Super Admin', role: 'SUPER_ADMIN' },
  update: {},
});
await prisma.$disconnect();
console.log(`Super admin: ${phone}`);
