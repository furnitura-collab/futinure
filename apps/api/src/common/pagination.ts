import type { z } from 'zod';
import type { Paginated, paginationSchema } from '@mebel/shared';

export type PageQuery = z.infer<typeof paginationSchema>;

/** Prisma findMany uchun `skip` / `take` */
export function pageArgs({ page, limit }: PageQuery) {
  return { skip: (page - 1) * limit, take: limit };
}

/** Sahifa va jami sonni parallel o'qib, `Paginated` javob qaytaradi */
export async function paginate<T>(q: PageQuery, items: PromiseLike<T[]>, total: PromiseLike<number>): Promise<Paginated<T>> {
  const [rows, count] = await Promise.all([items, total]);
  return { items: rows, total: count, page: q.page, limit: q.limit };
}
