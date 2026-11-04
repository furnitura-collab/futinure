import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Unit } from '@mebel/shared';
import { SearchInput } from '@/components/SearchInput';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { attrsText } from '@/lib/catalog';
import { useDebounced } from '@/lib/hooks';
import type { AdminProduct, Paginated } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface PickedVariant {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  unit: Unit;
  basePrice: number;
  availableQty: string;
  onOrder: boolean;
  qtyStep: string;
  minQty: string;
}

/** Nom yoki SKU bo'yicha qidirib variant tanlash (xodim aniq qoldiqni ko'radi) */
export function VariantPicker({ onPick, exclude = [] }: { onPick: (v: PickedVariant) => void; exclude?: string[] }) {
  const { t, money, label } = useI18n();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim());
  const { data, isFetching } = useQuery({
    queryKey: ['variant-picker', query],
    queryFn: () => api<Paginated<AdminProduct>>('/admin/products', { query: { q: query, isActive: true, limit: 8 } }),
    enabled: query.length >= 2,
  });

  const rows: PickedVariant[] = (data?.items ?? []).flatMap((p) =>
    p.variants
      .filter((v) => v.isActive && !exclude.includes(v.id))
      .map((v) => ({
        variantId: v.id,
        productId: p.id,
        sku: v.sku,
        name: Object.keys(v.attributes).length ? `${p.nameUz} — ${attrsText(v.attributes)}` : p.nameUz,
        unit: p.unit,
        basePrice: v.basePrice,
        availableQty: v.availableQty,
        onOrder: v.onOrder,
        qtyStep: p.qtyStep,
        minQty: p.minQty,
      })),
  );

  return (
    <div className="space-y-2">
      <SearchInput autoFocus className="sm:w-full" placeholder={t('picker.placeholder')} value={q} onChange={setQ} loading={isFetching} />
      {query.length >= 2 && (
        <ul role="listbox" className="max-h-64 divide-y overflow-y-auto rounded-lg border bg-card">
          {rows.length === 0 && !isFetching && <li className="p-3 text-sm text-muted-foreground">{t('picker.notFound')}</li>}
          {rows.map((r) => {
            const empty = Number(r.availableQty) <= 0 && !r.onOrder;
            return (
              <li key={r.variantId}>
                <button
                  type="button"
                  disabled={empty}
                  onClick={() => {
                    onPick(r);
                    setQ('');
                  }}
                  className={cn(
                    'flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-left text-sm transition-colors outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-50',
                  )}
                >
                  <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{r.sku}</span>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.onOrder && Number(r.availableQty) <= 0 ? t('picker.onOrder') : `${r.availableQty} ${label('unit', r.unit)}`}
                  </span>
                  <span className="w-28 shrink-0 text-right font-medium tabular">{money(r.basePrice)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
