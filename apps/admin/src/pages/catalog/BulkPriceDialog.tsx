import { useState } from 'react';
import { ROUND_TO } from '@mebel/shared';
import { api } from '../../lib/api';
import { flattenCategories, useBrands, useCategories } from '../../lib/catalog';
import { num, som } from '../../lib/format';
import { useApiMutation } from '../../lib/mutation';
import { Button, cx, Dialog, Field, Input, Select, Toggle } from '../../components/ui';

interface BulkResult {
  dryRun: boolean;
  summary: { percent: number; variantCount: number; oldTotal: number; newTotal: number };
  preview: { variantId: string; sku: string; name: string; oldPrice: number; newPrice: number }[];
}

/** Masalan dollar kursi oshganda: kategoriya/brend narxini +5%, 1000 so'mga yaxlitlab */
export function BulkPriceDialog({ onClose }: { onClose: () => void }) {
  const categories = useCategories();
  const brands = useBrands();
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [percent, setPercent] = useState('5');
  const [roundTo, setRoundTo] = useState<number>(1000);
  const [includeTiers, setIncludeTiers] = useState(true);
  const [includeGroupPrices, setIncludeGroupPrices] = useState(true);
  const [result, setResult] = useState<BulkResult | null>(null);

  const p = Number(percent.replace(',', '.'));
  const valid = (categoryId || brandId) && Number.isFinite(p) && p !== 0 && p >= -50 && p <= 200;

  const run = useApiMutation(
    (dryRun: boolean) =>
      api<BulkResult>('/admin/prices/bulk-update', {
        body: { categoryId: categoryId || undefined, brandId: brandId || undefined, percent: p, roundTo, includeTiers, includeGroupPrices, dryRun },
      }),
    {
      invalidate: [['products']],
      onSuccess: (r) => setResult(r),
    },
  );
  // Parametr o'zgarsa — oldingi ko'rinish eskirgan
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setResult(null);
  };

  const applied = result && !result.dryRun;
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title="Ommaviy narx o'zgartirish"
      footer={
        applied ? (
          <Button onClick={onClose}>Yopish</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Bekor</Button>
            {result ? (
              <Button variant="danger" loading={run.isPending} onClick={() => run.mutate(false)}>
                {result.summary.variantCount} ta narxni o'zgartirish
              </Button>
            ) : (
              <Button loading={run.isPending} disabled={!valid} onClick={() => run.mutate(true)}>Ko'rish</Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kategoriya">
            {(id) => (
              <Select id={id} value={categoryId} onChange={(e) => change(setCategoryId)(e.target.value)}>
                <option value="">—</option>
                {flattenCategories(categories.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Brend">
            {(id) => (
              <Select id={id} value={brandId} onChange={(e) => change(setBrandId)(e.target.value)}>
                <option value="">—</option>
                {brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Foiz (+ oshirish, − kamaytirish)">
            {(id) => <Input id={id} inputMode="decimal" value={percent} onChange={(e) => change(setPercent)(e.target.value)} />}
          </Field>
          <Field label="Yaxlitlash">
            {(id) => (
              <Select id={id} value={roundTo} onChange={(e) => change(setRoundTo)(Number(e.target.value))}>
                {ROUND_TO.map((r) => <option key={r} value={r}>{r === 1 ? 'Yaxlitlamaslik' : `${num(r)} so'mga`}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div className="flex gap-6">
          <Toggle checked={includeTiers} onChange={change(setIncludeTiers)} label="Pog'onali narxlar ham" />
          <Toggle checked={includeGroupPrices} onChange={change(setIncludeGroupPrices)} label="Guruh narxlari ham" />
        </div>

        {result && (
          <div className="space-y-2">
            <p className={cx('rounded-lg p-3 text-sm ring-1', applied ? 'bg-emerald-50 text-emerald-900 ring-emerald-200' : 'bg-amber-50 text-amber-900 ring-amber-200')}>
              {applied ? 'Qo\'llandi: ' : 'Ko\'rinish (hali saqlanmadi): '}
              {result.summary.variantCount} ta variant, {result.summary.percent > 0 ? '+' : ''}{result.summary.percent}%
            </p>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-stone-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-50 text-left text-xs text-stone-500">
                  <tr>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Nomi</th>
                    <th className="px-3 py-2 text-right">Hozir</th>
                    <th className="px-3 py-2 text-right">Yangi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {result.preview.map((r) => (
                    <tr key={r.variantId}>
                      <td className="px-3 py-1.5 font-mono text-xs">{r.sku}</td>
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5 text-right text-stone-500">{som(r.oldPrice)}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{som(r.newPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
