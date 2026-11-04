import { ArrowRightLeft, RotateCcw, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { MoneyInput } from '@/components/MoneyInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import type { OrderItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import type { PickedVariant } from './VariantPicker';
import { VariantPicker } from './VariantPicker';

export interface Priced {
  qty: string;
  /** null — katalog narxi */
  price: number | null;
}

export interface LineEdit extends Priced {
  item: OrderItem;
  removed: boolean;
  replacement: (PickedVariant & Priced) | null;
  picking: boolean;
}

export type Addition = PickedVariant & Priced;

const decimal = (s: string) => s.replace(',', '.');

/** Miqdor + narx maydonlari (narx bo'sh — katalog narxi) */
function QtyPrice({ value, onChange, unit }: { value: Priced; onChange: (v: Priced) => void; unit?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={t('order.qty')}
        inputMode="decimal"
        className="w-20 text-right tabular"
        value={value.qty}
        onChange={(e) => onChange({ ...value, qty: decimal(e.target.value) })}
      />
      {unit && <span className="w-10 text-xs text-muted-foreground">{unit}</span>}
      <MoneyInput
        aria-label={t('order.price')}
        className="w-36"
        placeholder={t('quote.pricePlaceholder')}
        value={value.price ?? 0}
        onChange={(v) => onChange({ ...value, price: v || null })}
      />
    </div>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 p-3', className)}>{children}</div>;
}

export function LineRow({ line: l, onChange }: { line: LineEdit; onChange: (p: Partial<LineEdit>) => void }) {
  const { t, money, label } = useI18n();
  const unit = label('unit', l.item.unit);
  return (
    <div className={cn('transition-colors', l.removed && 'bg-muted/50')}>
      <Row>
        <div className={cn('min-w-0 flex-1 basis-48', (l.removed || l.replacement) && 'text-muted-foreground line-through')}>
          <p className="truncate text-sm font-medium">{l.item.nameUz}</p>
          <p className="text-xs text-muted-foreground">
            {l.item.sku} · {money(l.item.unitPrice)} / {unit}
            {l.item.stock?.shortage && <span className="ml-2 font-medium text-destructive">{t('quote.inStock', { qty: l.item.stock.available })}</span>}
          </p>
        </div>
        {!l.removed && !l.replacement && <QtyPrice value={l} unit={unit} onChange={(v) => onChange(v)} />}
        <div className="flex gap-1">
          {!l.removed && (
            <Button variant="ghost" size="icon-sm" title={t('quote.replace')} aria-label={t('quote.replace')} onClick={() => onChange({ picking: !l.picking })}>
              <ArrowRightLeft />
            </Button>
          )}
          <Button
            variant={l.removed ? 'ghost' : 'ghost-destructive'}
            size="icon-sm"
            title={l.removed ? t('quote.restore') : t('quote.remove')}
            aria-label={l.removed ? t('quote.restore') : t('quote.remove')}
            onClick={() => onChange({ removed: !l.removed, replacement: null, picking: false })}
          >
            {l.removed ? <RotateCcw /> : <Trash2 />}
          </Button>
        </div>
      </Row>
      {l.picking && !l.replacement && (
        <div className="px-3 pb-3">
          <VariantPicker exclude={[l.item.variantId]} onPick={(v) => onChange({ replacement: { ...v, qty: l.qty, price: null }, picking: false })} />
        </div>
      )}
      {l.replacement && (
        <Row className="mx-3 mb-3 rounded-lg bg-violet/8 ring-1 ring-violet/20">
          <Badge variant="violet">{t('quote.analog')}</Badge>
          <div className="min-w-0 flex-1 basis-40">
            <p className="truncate text-sm">{l.replacement.name}</p>
            <p className="text-xs text-muted-foreground">
              {l.replacement.sku} · {t('quote.inStock', { qty: l.replacement.availableQty })}
            </p>
          </div>
          <QtyPrice value={l.replacement} onChange={(v) => l.replacement && onChange({ replacement: { ...l.replacement, ...v } })} />
          <Button variant="ghost" size="icon-sm" title={t('quote.restore')} aria-label={t('quote.restore')} onClick={() => onChange({ replacement: null })}>
            <RotateCcw />
          </Button>
        </Row>
      )}
    </div>
  );
}

export function AdditionRow({ addition: a, onChange, onRemove }: { addition: Addition; onChange: (v: Priced) => void; onRemove: () => void }) {
  const { t, money } = useI18n();
  return (
    <Row className="bg-success/5">
      <Badge variant="success">{t('quote.added')}</Badge>
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm">{a.name}</p>
        <p className="text-xs text-muted-foreground">
          {a.sku} · {money(a.basePrice)} · {t('quote.inStock', { qty: a.availableQty })}
        </p>
      </div>
      <QtyPrice value={a} onChange={onChange} />
      <Button variant="ghost-destructive" size="icon-sm" title={t('quote.remove')} aria-label={t('quote.remove')} onClick={onRemove}>
        <Trash2 />
      </Button>
    </Row>
  );
}
