import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { Unit } from '@mebel/shared';
import { api } from '../../lib/api';
import { som } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { UNIT } from '../../lib/labels';
import type { Paginated } from '../../lib/types';
import { cx, Input, Spinner } from '../../components/ui';

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

interface AdminProduct {
  id: string;
  nameUz: string;
  unit: Unit;
  minQty: string;
  qtyStep: string;
  isActive: boolean;
  variants: {
    id: string;
    sku: string;
    attributes: Record<string, string | number>;
    basePrice: number;
    availableQty: string;
    onOrder: boolean;
    isActive: boolean;
  }[];
}

/** Nom yoki SKU bo'yicha qidirib variant tanlash (xodim aniq qoldiqni ko'radi) */
export function VariantPicker({ onPick, exclude = [] }: { onPick: (v: PickedVariant) => void; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim());
  const { data, isFetching } = useQuery({
    queryKey: ['variant-picker', query],
    queryFn: () => api<Paginated<AdminProduct>>('/admin/products', { query: { q: query, isActive: true, limit: 8 } }),
    enabled: query.length >= 2,
  });

  const rows = (data?.items ?? []).flatMap((p) =>
    p.variants
      .filter((v) => v.isActive && !exclude.includes(v.id))
      .map((v) => ({
        variantId: v.id,
        productId: p.id,
        sku: v.sku,
        name: `${p.nameUz}${Object.keys(v.attributes).length ? ` — ${Object.values(v.attributes).join(', ')}` : ''}`,
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
      <div className="relative">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-stone-400" />
        <Input autoFocus className="pl-9" placeholder="Tovar nomi yoki SKU" value={q} onChange={(e) => setQ(e.target.value)} />
        {isFetching && <Spinner className="absolute top-2.5 right-3 size-4" />}
      </div>
      {query.length >= 2 && (
        <ul className="max-h-60 divide-y divide-stone-100 overflow-y-auto rounded-lg border border-stone-200">
          {rows.length === 0 && !isFetching && <li className="p-3 text-sm text-stone-500">Topilmadi</li>}
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
                  className={cx('flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-brand-50', empty && 'opacity-50')}
                >
                  <span className="w-28 shrink-0 font-mono text-xs text-stone-500">{r.sku}</span>
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="shrink-0 text-xs text-stone-500">
                    {r.onOrder && Number(r.availableQty) <= 0 ? 'buyurtmaga' : `${r.availableQty} ${UNIT[r.unit]}`}
                  </span>
                  <span className="w-28 shrink-0 text-right font-medium">{som(r.basePrice)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
