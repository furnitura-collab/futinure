/**
 * Production: ADMIN_PHONE raqamli super admin (bo'lmasa yaratadi).
 * ADMIN_PASSWORD berilsa — paroli hali yo'q bo'lsagina o'rnatiladi: har restartda
 * admin o'zi almashtirgan parol qayta yozilib ketmasin.
 * Demo ma'lumotlarsiz toza bazaga birinchi kirish uchun.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { normalizeUzPhone, PASSWORD_MIN } from '@mebel/shared';
import { hashPassword } from '../src/auth/password.js';
import { PrismaClient } from '../src/generated/prisma/client.js';

const phone = normalizeUzPhone(process.env.ADMIN_PHONE ?? '');
if (!phone) {
  console.error(`ADMIN_PHONE noto'g'ri: "${process.env.ADMIN_PHONE ?? ''}"`);
  process.exit(1);
}
const password = process.env.ADMIN_PASSWORD || undefined;
if (password && password.length < PASSWORD_MIN) {
  console.error(`ADMIN_PASSWORD kamida ${PASSWORD_MIN} belgi bo'lishi kerak`);
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const passwordHash = password ? await hashPassword(password) : null;
const admin = await prisma.user.upsert({
  where: { phone },
  create: { phone, fullName: process.env.ADMIN_NAME || 'Super Admin', role: 'SUPER_ADMIN', passwordHash },
  update: {},
  select: { id: true, passwordHash: true },
});
if (passwordHash && !admin.passwordHash) {
  await prisma.user.update({ where: { id: admin.id }, data: { passwordHash } });
}
await prisma.$disconnect();
console.log(`Super admin: ${phone}${passwordHash || admin.passwordHash ? '' : ' (parol yo\'q — ADMIN_PASSWORD bering)'}`);
