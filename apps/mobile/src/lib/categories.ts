import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { IconName } from '@/components/ui';
import { api } from './api';
import type { CategoryNode } from './types';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories'), staleTime: 5 * 60_000 });
}

/** Demo katalogda rasm yo'q — kategoriya belgisi rasm o'rnini bosadi, shuning uchun mazmunli bo'lishi kerak */
const SLUG_ICON: Record<string, IconName> = {
  plitalar: 'layers-outline',
  ldsp: 'layers-outline',
  mdf: 'albums-outline',
  kromka: 'reorder-four-outline',
  furnitura: 'construct-outline',
  petlya: 'git-compare-outline',
  yonaltiruvchi: 'swap-horizontal-outline',
  ruchka: 'hand-left-outline',
  mahkamlagich: 'hammer-outline',
};
const KIND_ICON: Record<string, IconName> = { BOARD: 'layers-outline', EDGE: 'reorder-four-outline', GOODS: 'cube-outline' };

export interface CategoryVisual {
  icon: IconName;
  /** theme.colors.tints indeksi — bir ildiz kategoriya ichida bir xil rang */
  tint: number;
}

interface Entry {
  slug: string;
  rootSlug: string;
  rootIndex: number;
}

function index(tree: CategoryNode[]) {
  const map = new Map<string, Entry>();
  tree.forEach((root, rootIndex) => {
    const walk = (n: CategoryNode) => {
      map.set(n.id, { slug: n.slug, rootSlug: root.slug, rootIndex });
      n.children.forEach(walk);
    };
    walk(root);
  });
  return map;
}

/** Kategoriya id → belgi va rang. Kategoriyalar hali yuklanmagan bo'lsa — mahsulot turidan */
export function useCategoryVisual() {
  const { data } = useCategories();
  const map = useMemo(() => index(data ?? []), [data]);
  return useCallback(
    (categoryId: string | null | undefined, kind?: string | null): CategoryVisual => {
      const e = categoryId ? map.get(categoryId) : undefined;
      return {
        icon: (e && (SLUG_ICON[e.slug] ?? SLUG_ICON[e.rootSlug])) || (kind ? KIND_ICON[kind] : undefined) || 'cube-outline',
        tint: e?.rootIndex ?? 0,
      };
    },
    [map],
  );
}
