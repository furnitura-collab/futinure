import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import type { TextInput } from 'react-native';
import { useI18n } from '@/i18n';
import { useCategories } from '@/lib/categories';
import { usePaginated } from '@/lib/query';
import type { ProductCard as Product } from '@/lib/types';
import type { Filters } from './CatalogFilters';

export interface ActiveFilter {
  key: string;
  label: string;
  clear: () => void;
}

const INITIAL: Filters = { q: '', categoryId: null, inStock: false, sort: 'popular' };

function useDebounced<T>(v: T, ms = 350) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

/** Katalog holati: filtrlar (URL parametrlari bilan), mahsulotlar sahifalari va faol filtr chiplari */
export function useCatalogFilters() {
  const { t, name } = useI18n();
  // Bosh sahifadan: ?categoryId=… (kategoriya) yoki ?focus=1 (qidiruv); sayt sarlavhasidan — ?q=…
  const params = useLocalSearchParams<{ categoryId?: string; focus?: string; q?: string }>();
  const [f, setF] = useState<Filters>({ ...INITIAL, categoryId: params.categoryId ?? null, q: params.q ?? '' });
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const query = useDebounced(f.q.trim());
  const categories = useCategories();
  const update = (patch: Partial<Filters>) => setF((x) => ({ ...x, ...patch }));

  useEffect(() => {
    if (params.categoryId !== undefined) update({ categoryId: params.categoryId || null });
  }, [params.categoryId]);
  useEffect(() => {
    if (params.q !== undefined) update({ q: params.q });
  }, [params.q]);
  useEffect(() => {
    if (params.focus) setTimeout(() => inputRef.current?.focus(), 300);
  }, [params.focus]);

  const products = usePaginated<Product>(['products', query, f.categoryId, f.inStock, f.sort], '/products', {
    query: { q: query || undefined, categoryId: f.categoryId, inStock: f.inStock || undefined, sort: f.sort },
    keepPrevious: true,
  });

  const category = categories.data?.find((c) => c.id === f.categoryId);
  const active = [
    category && { key: 'c', label: name(category), clear: () => update({ categoryId: null }) },
    f.inStock && { key: 's', label: t('inStockOnly'), clear: () => update({ inStock: false }) },
    query && {
      key: 'q',
      label: `“${query}”`,
      clear: () => {
        update({ q: '' });
        // Sarlavhadagi qidiruv ham URL'dan o'qiydi
        if (params.q) router.setParams({ q: '' });
      },
    },
  ].filter((x): x is ActiveFilter => !!x);

  return {
    filters: f,
    update,
    reset: () => setF(INITIAL),
    inputRef,
    products,
    total: products.data?.pages[0]?.total,
    category,
    active,
  };
}
