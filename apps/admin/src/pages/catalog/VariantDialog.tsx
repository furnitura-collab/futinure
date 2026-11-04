import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { SwitchField } from '@/components/SwitchField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import type { AdminProduct, AdminVariant } from '@/lib/types';
import { AttributesEditor, GroupPricesEditor, PriceHistory, TiersEditor, type Pair, type Tier } from './VariantPricing';

const attrsToPairs = (a: Record<string, string | number>): Pair[] => Object.entries(a).map(([key, value]) => ({ key, value: String(value) }));
/** "16" → 16, "0190" (kod) matn bo'lib qoladi — backend Excel import bilan bir xil qoida */
const pairsToAttrs = (pairs: Pair[]) =>
  Object.fromEntries(
    pairs
      .filter((p) => p.key.trim() && p.value.trim())
      .map((p) => [p.key.trim(), /^-?(0|[1-9]\d*)([.,]\d+)?$/.test(p.value.trim()) ? Number(p.value.replace(',', '.')) : p.value.trim()]),
  );

export function VariantDialog({ product, variant, onClose }: { product: AdminProduct; variant: AdminVariant | null; onClose: () => void }) {
  const { t, label } = useI18n();
  const { can } = useAuth();
  const [sku, setSku] = useState(variant?.sku ?? '');
  const [pairs, setPairs] = useState<Pair[]>(() => (variant ? attrsToPairs(variant.attributes) : [{ key: 'color', value: '' }]));
  const [basePrice, setBasePrice] = useState(variant?.basePrice ?? 0);
  const [lowStock, setLowStock] = useState(variant?.lowStockThreshold ?? '0');
  const [onOrder, setOnOrder] = useState(variant?.onOrder ?? false);
  const [leadTime, setLeadTime] = useState(variant?.leadTimeDays?.toString() ?? '');
  const [isActive, setIsActive] = useState(variant?.isActive ?? true);
  const [tiers, setTiers] = useState<Tier[]>(variant?.priceTiers ?? []);
  const [groupPrices, setGroupPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries((variant?.groupPrices ?? []).map((g) => [g.priceGroupId, g.price])),
  );
  const [deleting, setDeleting] = useState(false);
  const unit = label('unit', product.unit);

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
        body: tiers.filter((x) => x.minQty && x.price > 0).map((x) => ({ minQty: x.minQty.replace(',', '.'), price: x.price })),
      });
      await api(`/admin/variants/${v.id}/group-prices`, {
        method: 'PUT',
        body: Object.entries(groupPrices)
          .filter(([, price]) => price > 0)
          .map(([priceGroupId, price]) => ({ priceGroupId, price })),
      });
    },
    { invalidate: [['product', product.id], ['products'], ['price-history']], success: t('variant.saved'), onSuccess: onClose },
  );
  const remove = useApiMutation(() => api(`/admin/variants/${variant?.id}`, { method: 'DELETE' }), {
    invalidate: [['product', product.id], ['products']],
    success: t('variant.deleted'),
    onSuccess: onClose,
  });

  return (
    <FormDialog
      size="xl"
      onClose={onClose}
      title={variant ? t('variant.title', { sku: variant.sku }) : t('variant.newTitle')}
      footer={
        <>
          {variant && can('SUPER_ADMIN') && (
            <Button variant="ghost-destructive" className="sm:mr-auto" onClick={() => setDeleting(true)}>
              {t('common.delete')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!sku.trim() || basePrice <= 0} onClick={() => save.mutate(undefined)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div className="grid content-start gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('variant.sku')}>{(f) => <Input {...f} value={sku} onChange={(e) => setSku(e.target.value)} />}</FormField>
            <FormField label={t('variant.basePrice', { unit })}>{(f) => <MoneyInput {...f} value={basePrice} onChange={setBasePrice} />}</FormField>
            <FormField label={t('variant.lowStock')}>
              {(f) => <Input {...f} inputMode="decimal" value={lowStock} onChange={(e) => setLowStock(e.target.value)} />}
            </FormField>
            <FormField label={t('variant.leadTime')} hint={t('variant.leadTimeHint')}>
              {(f) => <Input {...f} inputMode="numeric" value={leadTime} onChange={(e) => setLeadTime(e.target.value.replace(/\D/g, ''))} />}
            </FormField>
          </div>
          <div className="grid gap-1">
            <SwitchField checked={onOrder} onCheckedChange={setOnOrder} label={t('variant.onOrder')} />
            <SwitchField checked={isActive} onCheckedChange={setIsActive} label={t('variant.onSale')} />
          </div>
          <AttributesEditor pairs={pairs} onChange={setPairs} />
        </div>

        <div className="grid content-start gap-5">
          <TiersEditor tiers={tiers} unit={unit} onChange={setTiers} />
          <GroupPricesEditor value={groupPrices} onChange={setGroupPrices} />
          {variant && <PriceHistory variantId={variant.id} />}
        </div>
      </div>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t('variant.deleteTitle')}
        description={t('variant.deleteText')}
        confirmLabel={t('common.delete')}
        destructive
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </FormDialog>
  );
}
