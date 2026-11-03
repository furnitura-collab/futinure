import { ArrowRightLeft, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { lineTotal } from '@mebel/shared';
import { api } from '../../lib/api';
import { som } from '../../lib/format';
import { UNIT } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { OrderDetail, OrderItem } from '../../lib/types';
import { Button, cx, Dialog, Field, Input, Select, Textarea } from '../../components/ui';
import { defaultTerms, MoneyInput, TermsForm, termsPayload, type TermsValue } from './TermsForm';
import { VariantPicker, type PickedVariant } from './VariantPicker';

interface LineEdit {
  item: OrderItem;
  qty: string;
  price: number | null; // null — katalog narxi
  removed: boolean;
  replacement: (PickedVariant & { qty: string; price: number | null }) | null;
  picking: boolean;
}

interface Addition extends PickedVariant {
  qty: string;
  price: number | null;
}

const validQty = (s: string) => /^\d{1,9}(\.\d{1,3})?$/.test(s) && Number(s) > 0;

export function QuoteDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
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

  /** Ko'rinish uchun taxminiy summa. Yakuniy narxni server mijoz guruhi va pog'onaga qarab hisoblaydi */
  const preview = (qty: string, price: number) => (validQty(qty) ? lineTotal(qty, price) : 0);
  const itemsTotal =
    lines.reduce((s, l) => {
      if (l.removed) return s;
      if (l.replacement) return s + preview(l.replacement.qty, l.replacement.price ?? l.replacement.basePrice);
      return s + preview(l.qty, l.price ?? l.item.unitPrice);
    }, 0) + additions.reduce((s, a) => s + preview(a.qty, a.price ?? a.basePrice), 0);

  const active = lines.filter((l) => !l.removed).length + additions.length;
  const invalid =
    active === 0 ||
    lines.some((l) => !l.removed && (l.replacement ? !validQty(l.replacement.qty) : !validQty(l.qty))) ||
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
          replacements: lines
            .filter((l) => l.replacement && !l.removed)
            .map((l) => ({
              itemId: l.item.id,
              variantId: l.replacement!.variantId,
              qty: l.replacement!.qty,
              unitPrice: l.replacement!.price ?? undefined,
            })),
          additions: additions.map((a) => ({ variantId: a.variantId, qty: a.qty, unitPrice: a.price ?? undefined })),
        },
      }),
    {
      invalidate: [['order', order.id], ['orders']],
      success: 'Taklif mijozga yuborildi',
      onSuccess: (res) => {
        for (const w of res.warnings) {
          const exceeds = w.issues.find((i) => i.code === 'EXCEEDS_AVAILABLE');
          if (exceeds) toast.warning(`${w.sku}: omborda faqat ${exceeds.available} ta`);
        }
        onClose();
      },
    },
  );

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`${order.number}: mijozga taklif`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button loading={mutation.isPending} disabled={invalid} onClick={() => mutation.mutate(undefined)}>
            Taklifni yuborish
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Tovarlar</h3>
          <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
            {lines.map((l, i) => (
              <div key={l.item.id} className={cx('space-y-2 p-3', l.removed && 'bg-stone-50')}>
                <div className="flex items-center gap-3">
                  <div className={cx('min-w-0 flex-1', (l.removed || l.replacement) && 'text-stone-400 line-through')}>
                    <p className="truncate text-sm font-medium">{l.item.nameUz}</p>
                    <p className="text-xs text-stone-500">
                      {l.item.sku} · {som(l.item.unitPrice)} / {UNIT[l.item.unit]}
                      {l.item.stock?.shortage && (
                        <span className="ml-2 font-medium text-rose-600">omborda {l.item.stock.available}</span>
                      )}
                    </p>
                  </div>
                  {!l.removed && !l.replacement && (
                    <>
                      <Input className="w-24 text-right" value={l.qty} onChange={(e) => patch(i, { qty: e.target.value.replace(',', '.') })} />
                      <span className="w-12 text-xs text-stone-500">{UNIT[l.item.unit]}</span>
                      <div className="w-36">
                        <MoneyInput value={l.price ?? 0} onChange={(v) => patch(i, { price: v || null })} />
                      </div>
                    </>
                  )}
                  <div className="flex gap-1">
                    {!l.removed && (
                      <Button variant="ghost" size="sm" title="Analog bilan almashtirish" onClick={() => patch(i, { picking: !l.picking })}>
                        <ArrowRightLeft className="size-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      title={l.removed ? 'Qaytarish' : 'Olib tashlash'}
                      onClick={() => patch(i, { removed: !l.removed, replacement: null, picking: false })}
                    >
                      {l.removed ? <RotateCcw className="size-4" /> : <Trash2 className="size-4 text-rose-600" />}
                    </Button>
                  </div>
                </div>
                {l.picking && !l.replacement && (
                  <VariantPicker
                    exclude={[l.item.variantId]}
                    onPick={(v) => patch(i, { replacement: { ...v, qty: l.qty, price: null }, picking: false })}
                  />
                )}
                {l.replacement && (
                  <div className="flex items-center gap-3 rounded-md bg-violet-50 p-2">
                    <span className="text-xs font-semibold text-violet-700">ANALOG</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{l.replacement.name}</p>
                      <p className="text-xs text-stone-500">{l.replacement.sku} · omborda {l.replacement.availableQty}</p>
                    </div>
                    <Input
                      className="w-24 text-right"
                      value={l.replacement.qty}
                      onChange={(e) => patch(i, { replacement: { ...l.replacement!, qty: e.target.value.replace(',', '.') } })}
                    />
                    <div className="w-36">
                      <MoneyInput
                        value={l.replacement.price ?? 0}
                        onChange={(v) => patch(i, { replacement: { ...l.replacement!, price: v || null } })}
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => patch(i, { replacement: null })}>
                      <RotateCcw className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {additions.map((a, i) => (
              <div key={a.variantId} className="flex items-center gap-3 bg-emerald-50/50 p-3">
                <span className="text-xs font-semibold text-emerald-700">YANGI</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{a.name}</p>
                  <p className="text-xs text-stone-500">{a.sku} · {som(a.basePrice)} · omborda {a.availableQty}</p>
                </div>
                <Input
                  className="w-24 text-right"
                  value={a.qty}
                  onChange={(e) => setAdditions((xs) => xs.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(',', '.') } : x)))}
                />
                <div className="w-36">
                  <MoneyInput value={a.price ?? 0} onChange={(v) => setAdditions((xs) => xs.map((x, j) => (j === i ? { ...x, price: v || null } : x)))} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => setAdditions((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4 text-rose-600" />
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Narx maydoni bo'sh — katalog narxi (mijoz guruhi va pog'onasi bilan). To'ldirilsa — sizning narxingiz.
          </p>
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
              <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Tovar qo'shish
              </Button>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Shartlar</h3>
          <TermsForm value={terms} onChange={setTerms} order={order} itemsTotal={itemsTotal} />
        </section>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <Field label="Mijozga izoh" hint="Nima o'zgarganini qisqa tushuntiring">
              {(id) => <Textarea id={id} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
            </Field>
          </div>
          <Field label="Amal qilish muddati">
            {(id) => (
              <Select id={id} value={ttl} onChange={(e) => setTtl(Number(e.target.value))}>
                {[2, 6, 24, 48, 72].map((h) => (
                  <option key={h} value={h}>{h} soat</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
