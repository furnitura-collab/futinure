import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { usePriceGroups } from '../../lib/catalog';
import { dateTime, som } from '../../lib/format';
import { UNIT } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { AdminProduct, AdminVariant } from '../../lib/types';
import { Button, Dialog, Field, Input, Toggle } from '../../components/ui';
import { MoneyInput } from '../orders/TermsForm';

type Pair = { key: string; value: string };

const attrsToPairs = (a: Record<string, string | number>): Pair[] => Object.entries(a).map(([key, value]) => ({ key, value: String(value) }));
/** "16" → 16, "0190" (kod) matn bo'lib qoladi — backend Excel import bilan bir xil qoida */
const pairsToAttrs = (pairs: Pair[]) =>
  Object.fromEntries(
    pairs
      .filter((p) => p.key.trim() && p.value.trim())
      .map((p) => [p.key.trim(), /^-?(0|[1-9]\d*)([.,]\d+)?$/.test(p.value.trim()) ? Number(p.value.replace(',', '.')) : p.value.trim()]),
  );

export function VariantDialog({ product, variant, onClose }: { product: AdminProduct; variant: AdminVariant | null; onClose: () => void }) {
  const { can } = useAuth();
  const groups = usePriceGroups();
  const [sku, setSku] = useState(variant?.sku ?? '');
  const [pairs, setPairs] = useState<Pair[]>(() => (variant ? attrsToPairs(variant.attributes) : [{ key: 'color', value: '' }]));
  const [basePrice, setBasePrice] = useState(variant?.basePrice ?? 0);
  const [lowStock, setLowStock] = useState(variant?.lowStockThreshold ?? '0');
  const [onOrder, setOnOrder] = useState(variant?.onOrder ?? false);
  const [leadTime, setLeadTime] = useState(variant?.leadTimeDays?.toString() ?? '');
  const [isActive, setIsActive] = useState(variant?.isActive ?? true);
  const [tiers, setTiers] = useState<{ minQty: string; price: number }[]>(variant?.priceTiers ?? []);
  const [groupPrices, setGroupPrices] = useState<Record<string, number>>(
    () => Object.fromEntries((variant?.groupPrices ?? []).map((g) => [g.priceGroupId, g.price])),
  );

  const history = useQuery({
    queryKey: ['price-history', variant?.id],
    queryFn: () => api<{ id: string; oldPrice: number; newPrice: number; source: string; createdAt: string }[]>(`/admin/variants/${variant!.id}/price-history`),
    enabled: !!variant,
  });

  const save = useApiMutation(
    async () => {
      const body = {
        sku: sku.trim(),
        attributes: pairsToAttrs(pairs),
        basePrice,
        lowStockThreshold: lowStock.replace(',', '.') || '0',
        onOrder,
        leadTimeDays: leadTime ? Number(leadTime) : null,
        isActive,
      };
      const v = variant
        ? await api<AdminVariant>(`/admin/variants/${variant.id}`, { method: 'PATCH', body })
        : await api<AdminVariant>(`/admin/products/${product.id}/variants`, { body });
      await api(`/admin/variants/${v.id}/price-tiers`, {
        method: 'PUT',
        body: tiers.filter((t) => t.minQty && t.price > 0).map((t) => ({ minQty: t.minQty.replace(',', '.'), price: t.price })),
      });
      await api(`/admin/variants/${v.id}/group-prices`, {
        method: 'PUT',
        body: Object.entries(groupPrices)
          .filter(([, price]) => price > 0)
          .map(([priceGroupId, price]) => ({ priceGroupId, price })),
      });
    },
    { invalidate: [['product', product.id], ['products'], ['price-history']], success: 'Variant saqlandi', onSuccess: onClose },
  );
  const remove = useApiMutation(() => api(`/admin/variants/${variant!.id}`, { method: 'DELETE' }), {
    invalidate: [['product', product.id], ['products']],
    success: 'Variant o\'chirildi',
    onSuccess: onClose,
  });

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={variant ? `Variant ${variant.sku}` : 'Yangi variant'}
      footer={
        <>
          {variant && can('SUPER_ADMIN') && (
            <Button variant="ghost" className="mr-auto text-rose-700" loading={remove.isPending} onClick={() => remove.mutate(undefined)}>
              O'chirish
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button loading={save.isPending} disabled={!sku.trim() || basePrice <= 0} onClick={() => save.mutate(undefined)}>Saqlash</Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU (artikul)">{(id) => <Input id={id} value={sku} onChange={(e) => setSku(e.target.value)} />}</Field>
            <Field label={`Chakana narx, 1 ${UNIT[product.unit]}`}>{(id) => <MoneyInput id={id} value={basePrice} onChange={setBasePrice} />}</Field>
            <Field label="Kam qoldiq chegarasi">{(id) => <Input id={id} value={lowStock} onChange={(e) => setLowStock(e.target.value)} />}</Field>
            <Field label="Kelish muddati, kun" hint="Buyurtma asosida bo'lsa">
              {(id) => <Input id={id} inputMode="numeric" value={leadTime} onChange={(e) => setLeadTime(e.target.value.replace(/\D/g, ''))} />}
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <Toggle checked={onOrder} onChange={setOnOrder} label="Buyurtma asosida (qoldiq yo'q bo'lsa ham qabul qilinadi)" />
            <Toggle checked={isActive} onChange={setIsActive} label="Sotuvda" />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-stone-700">Xususiyatlar</p>
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Input placeholder="color" value={p.key} onChange={(e) => setPairs((ps) => ps.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                  <Input placeholder="Oq" value={p.value} onChange={(e) => setPairs((ps) => ps.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <Button variant="ghost" onClick={() => setPairs((ps) => ps.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setPairs((ps) => [...ps, { key: '', value: '' }])}>
                <Plus className="size-4" /> Xususiyat
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-1.5 text-sm font-medium text-stone-700">Pog'onali narx (ko'p olsa arzonroq)</p>
            <div className="space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input className="w-28" placeholder="10" value={t.minQty} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, minQty: e.target.value } : x)))} />
                  <span className="shrink-0 text-sm whitespace-nowrap text-stone-500">{UNIT[product.unit]}dan →</span>
                  <MoneyInput value={t.price} onChange={(v) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, price: v } : x)))} />
                  <Button variant="ghost" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" onClick={() => setTiers((ts) => [...ts, { minQty: '', price: 0 }])}>
                <Plus className="size-4" /> Pog'ona
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-stone-700">Guruh narxlari</p>
            <div className="space-y-2">
              {groups.data?.map((g) => (
                <div key={g.id} className="flex items-center gap-2">
                  <span className="w-28 text-sm">{g.name}</span>
                  <MoneyInput value={groupPrices[g.id] ?? 0} onChange={(v) => setGroupPrices((gp) => ({ ...gp, [g.id]: v }))} />
                </div>
              ))}
              <p className="text-xs text-stone-500">Bo'sh — guruh narxi yo'q. Mijozga eng arzon narx (chakana, pog'ona, guruh) qo'llanadi.</p>
            </div>
          </div>

          {variant && !!history.data?.length && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-stone-700">Narx tarixi</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-stone-600">
                {history.data.map((h) => (
                  <li key={h.id}>
                    {dateTime(h.createdAt)}: {som(h.oldPrice)} → {som(h.newPrice)}{' '}
                    <span className="text-stone-400">({h.source === 'BULK' ? 'ommaviy' : h.source === 'IMPORT' ? 'Excel' : 'qo\'lda'})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
