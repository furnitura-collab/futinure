import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { formatDateTime } from '@mebel/shared';
import { MoneyInput } from '@/components/MoneyInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { usePriceGroups } from '@/lib/catalog';

export type Pair = { key: string; value: string };
export type Tier = { minQty: string; price: number };

const update = <T,>(list: T[], i: number, patch: Partial<T>) => list.map((x, j) => (j === i ? { ...x, ...patch } : x));

export function AttributesEditor({ pairs, onChange }: { pairs: Pair[]; onChange: (p: Pair[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2">
      <Label>{t('variant.attributes')}</Label>
      {pairs.map((p, i) => (
        <div key={i} className="flex gap-2">
          <Input aria-label={t('variant.attributes')} placeholder={t('variant.attrKey')} value={p.key} onChange={(e) => onChange(update(pairs, i, { key: e.target.value }))} />
          <Input aria-label={t('variant.attributes')} placeholder={t('variant.attrValue')} value={p.value} onChange={(e) => onChange(update(pairs, i, { value: e.target.value }))} />
          <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => onChange(pairs.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="w-fit" onClick={() => onChange([...pairs, { key: '', value: '' }])}>
        <Plus /> {t('variant.addAttr')}
      </Button>
    </div>
  );
}

export function TiersEditor({ tiers, unit, onChange }: { tiers: Tier[]; unit: string; onChange: (t: Tier[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2">
      <Label>{t('variant.tiers')}</Label>
      {tiers.map((tier, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label={t('order.qty')}
            inputMode="decimal"
            className="w-24"
            placeholder="10"
            value={tier.minQty}
            onChange={(e) => onChange(update(tiers, i, { minQty: e.target.value }))}
          />
          <span className="shrink-0 text-sm whitespace-nowrap text-muted-foreground">{t('variant.tierFrom', { unit })}</span>
          <MoneyInput aria-label={t('catalog.price')} className="flex-1" value={tier.price} onChange={(v) => onChange(update(tiers, i, { price: v }))} />
          <Button variant="ghost" size="icon" aria-label={t('common.delete')} onClick={() => onChange(tiers.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="w-fit" onClick={() => onChange([...tiers, { minQty: '', price: 0 }])}>
        <Plus /> {t('variant.addTier')}
      </Button>
    </div>
  );
}

export function GroupPricesEditor({ value, onChange }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  const { t } = useI18n();
  const groups = usePriceGroups();
  return (
    <div className="grid gap-2">
      <Label>{t('variant.groupPrices')}</Label>
      {groups.data?.map((g) => (
        <div key={g.id} className="flex items-center gap-2">
          <span className="w-28 truncate text-sm">{g.name}</span>
          <MoneyInput aria-label={g.name} className="flex-1" value={value[g.id] ?? 0} onChange={(v) => onChange({ ...value, [g.id]: v })} />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t('variant.groupHint')}</p>
    </div>
  );
}

type PriceSource = 'BULK' | 'IMPORT' | 'MANUAL';
const isSource = (s: string): s is PriceSource => s === 'BULK' || s === 'IMPORT' || s === 'MANUAL';

export function PriceHistory({ variantId }: { variantId: string }) {
  const { t, money } = useI18n();
  const history = useQuery({
    queryKey: ['price-history', variantId],
    queryFn: () => api<{ id: string; oldPrice: number; newPrice: number; source: string; createdAt: string }[]>(`/admin/variants/${variantId}/price-history`),
  });
  if (!history.data?.length) return null;
  return (
    <div className="grid gap-1.5">
      <Label>{t('variant.history')}</Label>
      <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
        {history.data.map((h) => (
          <li key={h.id}>
            {formatDateTime(h.createdAt)}: <span className="text-foreground tabular">{money(h.oldPrice)} → {money(h.newPrice)}</span>{' '}
            ({isSource(h.source) ? t(`variant.source.${h.source}`) : h.source})
          </li>
        ))}
      </ul>
    </div>
  );
}
