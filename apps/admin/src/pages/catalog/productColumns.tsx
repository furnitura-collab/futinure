import type { Column } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import type { AdminProduct } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ProductThumb } from './ProductThumb';

function priceRange(p: AdminProduct, money: (n: number) => string) {
  if (!p.variants.length) return '—';
  const prices = p.variants.map((v) => v.basePrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? money(min) : `${money(min)} – ${money(max)}`;
}

const availableQty = (p: AdminProduct) => p.variants.reduce((s, v) => s + Number(v.availableQty), 0);

function Price({ p }: { p: AdminProduct }) {
  const { money } = useI18n();
  return <span className="whitespace-nowrap tabular">{priceRange(p, money)}</span>;
}

/** Mavjud qoldiq; kam qolgan variantlar bo'lsa — ogohlantirish rangi va soni. `inline` — bitta qatorda */
function Availability({ p, inline }: { p: AdminProduct; inline?: boolean }) {
  const { t, label } = useI18n();
  const low = p.variants.filter((v) => v.isActive && (v.stockLevel === 'LOW' || v.stockLevel === 'OUT_OF_STOCK')).length;
  const qty = `${availableQty(p)} ${label('unit', p.unit)}`;
  const lowText = low > 0 ? t('catalog.lowVariants', { n: low }) : null;
  if (inline) return <span className={cn('whitespace-nowrap tabular', low > 0 ? 'text-warning' : 'text-muted-foreground')}>{[qty, lowText].filter(Boolean).join(' · ')}</span>;
  return (
    <div className={cn('whitespace-nowrap tabular', low > 0 && 'text-warning')}>
      {qty}
      {lowText && <p className="text-xs">{lowText}</p>}
    </div>
  );
}

/** Nom katakchasi. Telefonda (kartada) — rasm, nom va kod, ostida bir qatorda narx va qoldiq */
function NameCell({ p }: { p: AdminProduct }) {
  const { t } = useI18n();
  const code = [p.code, p.brand?.name].filter(Boolean).join(' · ');
  return (
    <div className="flex min-w-0 items-start gap-3 sm:min-w-44">
      <span className="shrink-0 sm:hidden">
        <ProductThumb name={p.nameUz} url={p.images[0]?.url} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{p.nameUz}</p>
          {!p.isActive && <Badge className="shrink-0 sm:hidden">{t('common.inactive')}</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">{code}</p>
        <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm sm:hidden">
          <Price p={p} />
          <span className="text-xs">
            <Availability p={p} inline />
          </span>
        </div>
      </div>
    </div>
  );
}

/** Katalog jadvali ustunlari; telefonda faqat nom katakchasi (karta) qoladi */
export function useProductColumns(): Column<AdminProduct>[] {
  const { t } = useI18n();
  return [
    {
      id: 'image',
      header: '',
      className: 'w-12 pr-0',
      hideBelow: 'sm',
      cell: (p) => <ProductThumb name={p.nameUz} url={p.images[0]?.url} />,
    },
    { id: 'name', header: t('catalog.product'), sortValue: (p) => p.nameUz, cell: (p) => <NameCell p={p} /> },
    { id: 'category', header: t('catalog.category'), hideBelow: 'md', cell: (p) => <span className="text-muted-foreground">{p.category.nameUz}</span> },
    { id: 'variants', header: t('catalog.variants'), hideBelow: 'lg', align: 'right', sortValue: (p) => p.variants.length, cell: (p) => p.variants.length },
    { id: 'price', header: t('catalog.price'), align: 'right', hideBelow: 'sm', cell: (p) => <Price p={p} /> },
    { id: 'available', header: t('catalog.available'), align: 'right', hideBelow: 'sm', sortValue: availableQty, cell: (p) => <Availability p={p} /> },
    { id: 'state', header: '', align: 'right', hideBelow: 'sm', cell: (p) => !p.isActive && <Badge>{t('common.inactive')}</Badge> },
  ];
}
