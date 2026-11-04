import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDateTime, type Unit } from '@mebel/shared';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { Paginated, StockMovement } from '@/lib/types';
import { cn } from '@/lib/utils';

type Mode = 'IN' | 'ADJUST';

function moveTone(m: StockMovement) {
  const negative = m.qty.startsWith('-');
  if (m.type === 'IN' || (m.type === 'ADJUST' && !negative)) return 'text-success';
  if (m.type === 'OUT' || negative) return 'text-destructive';
  return 'text-muted-foreground';
}

/** Kirim (yetkazib beruvchidan) yoki inventarizatsiya (sanalgan haqiqiy qoldiq) + harakatlar tarixi */
export function StockDialog({
  variant,
  unit,
  title,
  onClose,
}: {
  variant: { id: string; stockQty: string; reservedQty: string };
  unit: Unit;
  title: string;
  onClose: () => void;
}) {
  const { t, label } = useI18n();
  const [mode, setMode] = useState<Mode>('IN');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const unitText = label('unit', unit);
  const movements = useQuery({
    queryKey: ['movements', variant.id],
    queryFn: () => api<Paginated<StockMovement>>(`/admin/stock/variants/${variant.id}/movements`, { query: { limit: 30 } }),
  });
  const save = useApiMutation(
    () =>
      api('/admin/stock/movements', {
        body:
          mode === 'IN'
            ? { type: 'IN', variantId: variant.id, qty: qty.replace(',', '.'), reason: reason.trim() || undefined }
            : { type: 'ADJUST', variantId: variant.id, actualQty: qty.replace(',', '.'), reason: reason.trim() },
      }),
    {
      invalidate: [['product'], ['products'], ['stock-low'], ['movements', variant.id]],
      success: mode === 'IN' ? t('stock.savedIn') : t('stock.savedAdjust'),
      onSuccess: onClose,
    },
  );
  const valid = /^\d+([.,]\d{1,3})?$/.test(qty) && (mode === 'IN' ? Number(qty.replace(',', '.')) > 0 : reason.trim().length >= 3);

  return (
    <FormDialog
      onClose={onClose}
      title={title}
      description={`${t('stock.current', { qty: variant.stockQty, unit: unitText })}${Number(variant.reservedQty) > 0 ? ` ${t('stock.reservedPart', { qty: variant.reservedQty })}` : ''}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v === 'ADJUST' ? 'ADJUST' : 'IN')}>
          <TabsList className="w-full">
            <TabsTrigger value="IN">{t('stock.modeIn')}</TabsTrigger>
            <TabsTrigger value="ADJUST">{t('stock.modeAdjust')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <FormField label={mode === 'IN' ? t('stock.qtyIn', { unit: unitText }) : t('stock.qtyAdjust', { unit: unitText })}>
          {(f) => <Input {...f} autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />}
        </FormField>
        <FormField label={mode === 'IN' ? t('stock.reasonIn') : t('stock.reasonAdjust')}>
          {(f) => <Input {...f} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </FormField>

        {!!movements.data?.items.length && (
          <div className="grid gap-1.5">
            <Label>{t('stock.movements')}</Label>
            <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border bg-card px-3 text-xs">
              {movements.data.items.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 py-1.5">
                  <span className="shrink-0 text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                  <span className="min-w-0 flex-1">
                    {t(`stock.move.${m.type}`)}
                    {m.order && ` · ${m.order.number}`}
                    {m.reason && <span className="text-muted-foreground"> · {m.reason}</span>}
                  </span>
                  <span className={cn('font-medium tabular', moveTone(m))}>{m.qty}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </FormDialog>
  );
}
