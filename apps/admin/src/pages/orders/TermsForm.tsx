import { PAYMENT_METHODS, PAYMENT_TERMS, type PaymentMethod, type PaymentTerms } from '@mebel/shared';
import { num, som } from '../../lib/format';
import { METHOD, TERMS } from '../../lib/labels';
import type { OrderDetail } from '../../lib/types';
import { cx, Field, Input, Select } from '../../components/ui';

export interface TermsValue {
  paymentTerms: PaymentTerms;
  advanceAmount: number;
  allowedMethods: PaymentMethod[];
  deliveryFee: number;
  discountTotal: number;
  deliveryDate: string;
}

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

/** "4 620 000" ko'rinishida yoziladigan pul maydoni */
export function MoneyInput({ value, onChange, id }: { value: number; onChange: (v: number) => void; id?: string }) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      value={value ? num(value) : ''}
      placeholder="0"
      onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
    />
  );
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
  const set = <K extends keyof TermsValue>(k: K, v: TermsValue[K]) => onChange({ ...value, [k]: v });
  const credit = order.customer.customerProfile?.creditLimit ?? 0;
  const grand = itemsTotal + order.servicesTotal + value.deliveryFee - value.discountTotal;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="To'lov sharti" hint={value.paymentTerms === 'CREDIT' ? `Kredit limiti: ${som(credit)}` : undefined}>
          {(id) => (
            <Select id={id} value={value.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value as PaymentTerms)}>
              {PAYMENT_TERMS.map((t) => (
                <option key={t} value={t} disabled={t === 'CREDIT' && credit <= 0}>
                  {TERMS[t]}
                  {t === 'CREDIT' && credit <= 0 ? ' (mijozga ochilmagan)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {value.paymentTerms === 'ADVANCE' && (
          <Field label="Avans miqdori">{(id) => <MoneyInput id={id} value={value.advanceAmount} onChange={(v) => set('advanceAmount', v)} />}</Field>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium text-stone-700">To'lov usullari</p>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => {
            const on = value.allowedMethods.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() =>
                  set('allowedMethods', on ? value.allowedMethods.filter((x) => x !== m) : [...value.allowedMethods, m])
                }
                className={cx(
                  'rounded-full px-3 py-1 text-sm ring-1',
                  on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-stone-600 ring-stone-300 hover:bg-stone-50',
                )}
              >
                {METHOD[m]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Yetkazish narxi">{(id) => <MoneyInput id={id} value={value.deliveryFee} onChange={(v) => set('deliveryFee', v)} />}</Field>
        <Field label="Chegirma">{(id) => <MoneyInput id={id} value={value.discountTotal} onChange={(v) => set('discountTotal', v)} />}</Field>
        <Field label={order.deliveryType === 'PICKUP' ? 'Tayyor bo\'lish sanasi' : 'Yetkazish sanasi'}>
          {(id) => <Input id={id} type="date" min={order.today} value={value.deliveryDate} onChange={(e) => set('deliveryDate', e.target.value)} />}
        </Field>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-stone-50 p-3 text-sm">
        <dt className="text-stone-500">Tovarlar</dt>
        <dd className="text-right">{som(itemsTotal)}</dd>
        {order.servicesTotal > 0 && (
          <>
            <dt className="text-stone-500">Xizmatlar</dt>
            <dd className="text-right">{som(order.servicesTotal)}</dd>
          </>
        )}
        <dt className="text-stone-500">Yetkazish</dt>
        <dd className="text-right">{som(value.deliveryFee)}</dd>
        <dt className="text-stone-500">Chegirma</dt>
        <dd className="text-right">−{som(value.discountTotal)}</dd>
        <dt className="font-semibold">Jami</dt>
        <dd className={cx('text-right font-semibold', grand < 0 && 'text-rose-600')}>{som(grand)}</dd>
      </dl>
    </div>
  );
}
