import { keepPreviousData, useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { Paginated } from '@mebel/shared';
import { api, type RequestOptions } from './api';

/** Sahifali ro'yxat (cheksiz aylantirish): `items` — barcha yuklangan sahifalar birlashtirilgan */
export function usePaginated<T, Extra extends object = object>(
  queryKey: QueryKey,
  path: string,
  { query, limit = 20, keepPrevious }: { query?: RequestOptions['query']; limit?: number; keepPrevious?: boolean } = {},
) {
  const q = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => api<Paginated<T> & Extra>(path, { query: { ...query, page: pageParam, limit } }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    // Filtr o'zgarganda eski natija ko'rinib turadi (qidiruv maydoni yo'qolmaydi, sakrash yo'q)
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const loadMore = () => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  };
  return { ...q, items, loadMore };
}
