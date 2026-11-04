import { Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { lineTotal } from '@mebel/shared';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { OptionSelect } from '@/components/OptionSelect';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { OrderDetail } from '@/lib/types';
import { AdditionRow, LineRow, type Addition, type LineEdit } from './QuoteLines';
import { defaultTerms, TermsForm, termsPayload, type TermsValue } from './TermsForm';
import { VariantPicker } from './VariantPicker';

const validQty = (s: string) => /^\d{1,9}(\.\d{1,3})?$/.test(s) && Number(s) > 0;
const TTL_HOURS = [2, 6, 24, 48, 72];

/** Ko'rinish uchun taxminiy summa. Yakuniy narxni server mijoz guruhi va pog'onaga qarab hisoblaydi */
const preview = (qty: string, price: number) => (validQty(qty) ? lineTotal(qty, price) : 0);

export function QuoteDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const { t } = useI18n();
  const [lines, setLines] = useState<LineEdit[]>(() =>
    order.items
      .filter((i) => i.status === 'ACTIVE')
      .map((item) => ({ item, qty: item.qty, price: null, removed: false, replacement: null, picking: false })),
  );
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [adding, setAdding] = useState(false);
  const [terms, setTerms] = useState<TermsValue>(() => defaultTerms(order));
  const [note, setNote] = useState('');
  const [ttl, setTtl] = useState(24);

  const patch = (i: number, p: Partial<LineEdit>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  const itemsTotal =
    lines.reduce((s, l) => {
      if (l.removed) return s;
      if (l.replacement) return s + preview(l.replacement.qty, l.replacement.price ?? l.replacement.basePrice);
      return s + preview(l.qty, l.price ?? l.item.unitPrice);
    }, 0) + additions.reduce((s, a) => s + preview(a.qty, a.price ?? a.basePrice), 0);

  const active = lines.filter((l) => !l.removed).length + additions.length;
  const invalid =
    active === 0 ||
    lines.some((l) => !l.removed && !validQty(l.replacement ? l.replacement.qty : l.qty)) ||
    additions.some((a) => !validQty(a.qty)) ||
    terms.allowedMethods.length === 0;

  const mutation = useApiMutation(
    () =>
      api<{ warnings: { sku: string; issues: { code: string; available?: string }[] }[] }>(`/admin/orders/${order.id}/quotes`, {
        body: {
          ...termsPayload(terms),
          expectedVersion: order.version,
          note: note.trim() || undefined,
          expiresInHours: ttl,
          itemChanges: lines
            .filter((l) => !l.replacement && (l.removed || l.qty !== l.item.qty || l.price !== null))
            .map((l) => ({ itemId: l.item.id, qty: l.removed ? '0' : l.qty, unitPrice: l.price ?? undefined })),
          replacements: lines.flatMap((l) =>
            l.replacement && !l.removed
              ? [{ itemId: l.item.id, variantId: l.replacement.variantId, qty: l.replacement.qty, unitPrice: l.replacement.price ?? undefined }]
              : [],
          ),
          additions: additions.map((a) => ({ variantId: a.variantId, qty: a.qty, unitPrice: a.price ?? undefined })),
        },
      }),
    {
      invalidate: [['order', order.id], ['orders']],
      success: t('quote.sent'),
      onSuccess: (res) => {
        for (const w of res.warnings) {
          const exceeds = w.issues.find((i) => i.code === 'EXCEEDS_AVAILABLE');
          if (exceeds) toast.warning(t('quote.stockWarning', { sku: w.sku, qty: exceeds.available ?? '0' }));
        }
        onClose();
      },
    },
  );

  return (
    <FormDialog
      size="xl"
      onClose={onClose}
      title={t('quote.title', { number: order.number })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={mutation.isPending} disabled={invalid} onClick={() => mutation.mutate(undefined)}>
            {t('quote.submit')}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold">{t('quote.items')}</h3>
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {lines.map((l, i) => (
              <LineRow key={l.item.id} line={l} onChange={(p) => patch(i, p)} />
            ))}
            {additions.map((a, i) => (
              <AdditionRow
                key={a.variantId}
                addition={a}
                onChange={(v) => setAdditions((xs) => xs.map((x, j) => (j === i ? { ...x, ...v } : x)))}
                onRemove={() => setAdditions((xs) => xs.filter((_, j) => j !== i))}
              />
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('quote.priceHint')}</p>
          <div className="mt-3">
            {adding ? (
              <VariantPicker
                exclude={[...lines.map((l) => l.item.variantId), ...additions.map((a) => a.variantId)]}
                onPick={(v) => {
                  setAdditions((xs) => [...xs, { ...v, qty: v.minQty, price: null }]);
                  setAdding(false);
                }}
              />
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                <Plus /> {t('quote.addItem')}
              </Button>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">{t('quote.terms')}</h3>
          <TermsForm value={terms} onChange={setTerms} order={order} itemsTotal={itemsTotal} />
        </section>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField className="sm:col-span-2" label={t('quote.note')} hint={t('quote.noteHint')}>
            {(f) => <Textarea {...f} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
          </FormField>
          <FormField label={t('quote.ttl')}>
            {(f) => (
              <OptionSelect
                {...f}
                value={String(ttl)}
                onValueChange={(v) => setTtl(Number(v))}
                options={TTL_HOURS.map((h) => ({ value: String(h), label: t('quote.hours', { n: h }) }))}
              />
            )}
          </FormField>
        </div>
      </div>
    </FormDialog>
  );
}
