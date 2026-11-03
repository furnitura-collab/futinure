import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { Brand, Category, PriceGroup } from './types';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/admin/categories'), staleTime: 60_000 });
}

export function useBrands() {
  return useQuery({ queryKey: ['brands'], queryFn: () => api<Brand[]>('/admin/brands'), staleTime: 60_000 });
}

export function usePriceGroups() {
  return useQuery({ queryKey: ['price-groups'], queryFn: () => api<PriceGroup[]>('/admin/price-groups'), staleTime: 60_000 });
}

/** Daraxtni select uchun tekis ro'yxatga: "Plitalar", "— LDSP", "— — 16 mm" */
export function flattenCategories(rows: Category[]): (Category & { depth: number; label: string })[] {
  const children = new Map<string | null, Category[]>();
  for (const c of rows) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  const out: (Category & { depth: number; label: string })[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of (children.get(parentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.nameUz.localeCompare(b.nameUz))) {
      out.push({ ...c, depth, label: `${'— '.repeat(depth)}${c.nameUz}` });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** "Yo'naltiruvchilar 16 mm" → "yonaltiruvchilar-16-mm" */
export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[ʻʼ'‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Atributlarni qisqa matnga: { color: "Oq", thickness: 16 } → "Oq, 16" */
export function attrsText(a: Record<string, string | number>) {
  return Object.values(a).join(', ');
}
