import { Prisma } from '../generated/prisma/client.js';

/** Nasiyaga topshirilgan va to'liq to'lanmagan buyurtma (`orders` jadvali, alias'siz) */
export const UNPAID_CREDIT_ORDER = Prisma.sql`payment_terms = 'CREDIT' AND status IN ('DELIVERED', 'COMPLETED') AND grand_total > paid_total`;
