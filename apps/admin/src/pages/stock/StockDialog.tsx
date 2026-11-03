import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Unit } from '@mebel/shared';
import { api } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { UNIT } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { Paginated, StockMovement } from '../../lib/types';
import { Button, cx, Dialog, Field, Input } from '../../components/ui';

const MOVE: Record<StockMovement['type'], string> = {
  IN: 'Kirim',
  OUT: 'Jo\'natildi',
  ADJUST: 'Inventarizatsiya',
  RESERVE: 'Band qilindi',
  RELEASE: 'Band bo\'shadi',
};

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
  const [mode, setMode] = useState<'IN' | 'ADJUST'>('IN');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
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
      success: mode === 'IN' ? 'Kirim qilindi' : 'Qoldiq tuzatildi',
      onSuccess: onClose,
    },
  );
  const valid = /^\d+([.,]\d{1,3})?$/.test(qty) && (mode === 'IN' ? Number(qty.replace(',', '.')) > 0 : reason.trim().length >= 3);

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>Saqlash</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          Hozir: {variant.stockQty} {UNIT[unit]}
          {Number(variant.reservedQty) > 0 && ` (shundan ${variant.reservedQty} band)`}
        </p>
        <div className="flex rounded-lg bg-stone-100 p-1">
          {(['IN', 'ADJUST'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx('flex-1 rounded-md py-1.5 text-sm font-medium', mode === m ? 'bg-white shadow-sm' : 'text-stone-500')}
            >
              {m === 'IN' ? 'Kirim' : 'Inventarizatsiya'}
            </button>
          ))}
        </div>
        <Field label={mode === 'IN' ? `Kelgan miqdor, ${UNIT[unit]}` : `Sanalgan haqiqiy qoldiq, ${UNIT[unit]}`}>
          {(id) => <Input id={id} autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />}
        </Field>
        <Field label={mode === 'IN' ? 'Izoh (yetkazib beruvchi, nakladnoy)' : 'Sabab (majburiy)'}>
          {(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}
        </Field>

        {!!movements.data?.items.length && (
          <div>
            <p className="mb-1 text-sm font-medium">Oxirgi harakatlar</p>
            <ul className="max-h-48 divide-y divide-stone-100 overflow-y-auto text-xs">
              {movements.data.items.map((m) => (
                <li key={m.id} className="flex justify-between gap-2 py-1.5">
                  <span className="text-stone-500">{dateTime(m.createdAt)}</span>
                  <span className="flex-1">
                    {MOVE[m.type]}
                    {m.order && ` · ${m.order.number}`}
                    {m.reason && <span className="text-stone-500"> · {m.reason}</span>}
                  </span>
                  <span className={cx('font-medium', m.type === 'IN' || (m.type === 'ADJUST' && !m.qty.startsWith('-')) ? 'text-emerald-700' : m.type === 'OUT' || m.qty.startsWith('-') ? 'text-rose-700' : 'text-stone-500')}>
                    {m.qty}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  );
}
