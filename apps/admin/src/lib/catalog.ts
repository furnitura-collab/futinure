import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useI18n } from '@/i18n';
import { api } from './api';
import type { AdminProduct, Brand, Category, PriceGroup } from './types';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/admin/categories'), staleTime: 60_000 });
}

export function useBrands() {
  return useQuery({ queryKey: ['brands'], queryFn: () => api<Brand[]>('/admin/brands'), staleTime: 60_000 });
}

export function usePriceGroups() {
  return useQuery({ queryKey: ['price-groups'], queryFn: () => api<PriceGroup[]>('/admin/price-groups'), staleTime: 60_000 });
}

/**
 * Sudrab tartiblash: keshda darhol yangi tartib, keyin bitta PUT; xato bo'lsa eski holat qaytadi.
 * Muvaffaqiyatda qayta so'ramaymiz — server holati optimistik bilan bir xil (baza uzoqda).
 */
export function useReorder<T>(queryKey: QueryKey, path: string, apply: (data: T, ids: string[]) => T, invalidate: QueryKey[] = []) {
  const qc = useQueryClient();
  const { t, errorText } = useI18n();
  return useMutation({
    mutationFn: (ids: string[]) => api(path, { method: 'PUT', body: { ids } }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<T>(queryKey);
      if (prev !== undefined) qc.setQueryData<T>(queryKey, apply(prev, ids));
      return { prev };
    },
    onError: (err, _ids, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(queryKey, ctx.prev);
      toast.error(errorText(err));
    },
    onSuccess: () => {
      toast.success(t('common.reordered'));
      for (const k of invalidate) void qc.invalidateQueries({ queryKey: k });
    },
  });
}

const orderOf = (ids: string[]) => new Map(ids.map((id, i) => [id, i]));

/** Bir ota ichidagi kategoriyalar tartibi */
export function useCategoryReorder() {
  return useReorder<Category[]>(['categories'], '/admin/categories/order', (rows, ids) => {
    const order = orderOf(ids);
    return rows.map((c) => (order.has(c.id) ? { ...c, sortOrder: order.get(c.id) ?? c.sortOrder } : c));
  });
}

/** Mahsulot rasmlari tartibi; birinchisi — asosiy (ro'yxatdagi kichik rasm ham shu) */
export function useImageReorder(productId: string) {
  return useReorder<AdminProduct>(
    ['product', productId],
    `/admin/products/${productId}/images/order`,
    (p, ids) => {
      const byId = new Map(p.images.map((i) => [i.id, i]));
      const images = ids.flatMap((id, sortOrder) => {
        const img = byId.get(id);
        return img ? [{ ...img, sortOrder }] : [];
      });
      return { ...p, images };
    },
    [['products']],
  );
}

/** Ota-kategoriya bo'yicha guruhlangan va tartiblangan bolalar */
export function categoryChildren(rows: Category[]): Map<string | null, Category[]> {
  const children = new Map<string | null, Category[]>();
  for (const c of rows) children.set(c.parentId, [...(children.get(c.parentId) ?? []), c]);
  for (const list of children.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.nameUz.localeCompare(b.nameUz));
  return children;
}

/** Daraxtni select uchun tekis ro'yxatga: "Plitalar", "— LDSP", "— — 16 mm" */
export function flattenCategories(rows: Category[]): (Category & { depth: number; label: string })[] {
  const children = categoryChildren(rows);
  const out: (Category & { depth: number; label: string })[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of children.get(parentId) ?? []) {
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
