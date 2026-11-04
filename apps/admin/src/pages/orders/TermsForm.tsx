import { PAYMENT_METHODS, PAYMENT_TERMS, type PaymentMethod, type PaymentTerms } from '@mebel/shared';
import { ChipGroup } from '@/components/ChipGroup';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { OptionSelect } from '@/components/OptionSelect';
import { TotalsList } from '@/components/TotalsList';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';

export interface TermsValue {
  paymentTerms: PaymentTerms;
  advanceAmount: number;
  allowedMethods: PaymentMethod[];
  deliveryFee: number;
  discountTotal: number;
  deliveryDate: string;
}

const isTerms = (v: string): v is PaymentTerms => (PAYMENT_TERMS as readonly string[]).includes(v);

export function defaultTerms(order: OrderDetail): TermsValue {
  const profile = order.customer.customerProfile;
  return {
    paymentTerms: order.paymentTerms ?? 'ON_DELIVERY',
    advanceAmount: order.advanceAmount,
    allowedMethods: order.allowedMethods.length ? order.allowedMethods : (profile?.allowedPaymentMethods ?? ['CASH']),
    deliveryFee: order.deliveryFee,
    discountTotal: order.discountTotal,
    deliveryDate: order.deliveryDate?.slice(0, 10) ?? '',
  };
}

export function termsPayload(v: TermsValue) {
  return {
    paymentTerms: v.paymentTerms,
    advanceAmount: v.paymentTerms === 'ADVANCE' ? v.advanceAmount : 0,
    allowedMethods: v.allowedMethods,
    deliveryFee: v.deliveryFee,
    discountTotal: v.discountTotal,
    deliveryDate: v.deliveryDate || undefined,
  };
}

export function TermsForm({
  value,
  onChange,
  order,
  itemsTotal,
}: {
  value: TermsValue;
  onChange: (v: TermsValue) => void;
  order: OrderDetail;
  itemsTotal: number;
}) {
  const { t, money, label } = useI18n();
  const set = <K extends keyof TermsValue>(k: K, v: TermsValue[K]) => onChange({ ...value, [k]: v });
  const credit = order.customer.customerProfile?.creditLimit ?? 0;
  const grand = itemsTotal + order.servicesTotal + value.deliveryFee - value.discountTotal;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('terms.paymentTerms')} hint={value.paymentTerms === 'CREDIT' ? t('terms.creditLimit', { amount: money(credit) }) : undefined}>
          {(f) => (
            <OptionSelect
              {...f}
              value={value.paymentTerms}
              onValueChange={(v) => isTerms(v) && set('paymentTerms', v)}
              options={PAYMENT_TERMS.map((pt) => ({
                value: pt,
                disabled: pt === 'CREDIT' && credit <= 0,
                label: pt === 'CREDIT' && credit <= 0 ? `${label('paymentTerms', pt)} ${t('terms.notOpened')}` : label('paymentTerms', pt),
              }))}
            />
          )}
        </FormField>
        {value.paymentTerms === 'ADVANCE' && (
          <FormField label={t('terms.advanceAmount')}>
            {(f) => <MoneyInput {...f} value={value.advanceAmount} onChange={(v) => set('advanceAmount', v)} />}
          </FormField>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label>{t('terms.methods')}</Label>
        <ChipGroup
          label={t('terms.methods')}
          value={value.allowedMethods}
          onChange={(v) => set('allowedMethods', v)}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: label('paymentMethod', m) }))}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t('terms.deliveryFee')}>{(f) => <MoneyInput {...f} value={value.deliveryFee} onChange={(v) => set('deliveryFee', v)} />}</FormField>
        <FormField label={t('terms.discount')}>{(f) => <MoneyInput {...f} value={value.discountTotal} onChange={(v) => set('discountTotal', v)} />}</FormField>
        <FormField label={order.deliveryType === 'PICKUP' ? t('terms.readyDate') : t('terms.deliveryDate')}>
          {(f) => <Input {...f} type="date" min={order.today} value={value.deliveryDate} onChange={(e) => set('deliveryDate', e.target.value)} />}
        </FormField>
      </div>

      <TotalsList
        className="rounded-lg bg-muted/50 p-4"
        rows={[
          { label: t('order.itemsTotal'), value: money(itemsTotal) },
          order.servicesTotal > 0 && { label: t('order.services'), value: money(order.servicesTotal) },
          { label: t('order.delivery'), value: money(value.deliveryFee) },
          { label: t('order.discount'), value: `−${money(value.discountTotal)}` },
          { label: t('order.grandTotal'), value: money(grand), strong: true, className: grand < 0 ? 'text-destructive' : undefined },
        ]}
      />
    </div>
  );
}
