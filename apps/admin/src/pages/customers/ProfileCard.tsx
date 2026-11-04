import { useState } from 'react';
import { CUSTOMER_TYPES, formatDateTime, formatPhone, PAYMENT_METHODS, type CustomerType, type PaymentMethod } from '@mebel/shared';
import { ChipGroup } from '@/components/ChipGroup';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { OptionSelect } from '@/components/OptionSelect';
import { SectionCard } from '@/components/SectionCard';
import { SwitchField } from '@/components/SwitchField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LOCALE_NAMES, useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { usePriceGroups } from '@/lib/catalog';
import { useApiMutation } from '@/lib/mutation';
import type { CustomerDetail } from '@/lib/types';

const isCustomerType = (v: string): v is CustomerType => (CUSTOMER_TYPES as readonly string[]).includes(v);

export function ProfileCard({ customer: c }: { customer: CustomerDetail }) {
  const { t, money, label } = useI18n();
  const { can } = useAuth();
  const groups = usePriceGroups();
  const p = c.customerProfile;
  const [fullName, setFullName] = useState(c.fullName ?? '');
  const [type, setType] = useState<CustomerType>(p?.type ?? 'INDIVIDUAL');
  const [companyName, setCompanyName] = useState(p?.companyName ?? '');
  const [inn, setInn] = useState(p?.inn ?? '');
  const [priceGroupId, setPriceGroupId] = useState(p?.priceGroupId ?? '');
  const [creditLimit, setCreditLimit] = useState(p?.creditLimit ?? 0);
  const [termDays, setTermDays] = useState(String(p?.paymentTermDays ?? 0));
  const [methods, setMethods] = useState<PaymentMethod[]>(p?.allowedPaymentMethods ?? ['CASH']);
  const [isActive, setIsActive] = useState(c.isActive);
  const admin = can('SUPER_ADMIN');

  const save = useApiMutation(
    () =>
      api(`/admin/customers/${c.id}`, {
        method: 'PATCH',
        body: {
          fullName: fullName.trim() || undefined,
          type,
          companyName: companyName.trim() || null,
          inn: inn.trim() || null,
          priceGroupId: priceGroupId || null,
          allowedPaymentMethods: methods,
          isActive,
          ...(admin && { creditLimit, paymentTermDays: Number(termDays) || 0 }),
        },
      }),
    { invalidate: [['customer', c.id], ['customers']], success: t('common.saved') },
  );
  const innInvalid = type === 'COMPANY' && inn !== '' && inn.length !== 9;

  return (
    <SectionCard title={t('customer.profile')} className="self-start" contentClassName="grid gap-4">
      <p className="text-sm">
        <a href={`tel:${c.phone}`} className="font-medium text-primary hover:underline">
          {formatPhone(c.phone)}
        </a>
        <span className="text-muted-foreground">
          {' '}
          · {LOCALE_NAMES[c.locale]} · {t('common.since', { date: formatDateTime(c.createdAt) })}
        </span>
      </p>
      <FormField label={t('customer.fullName')}>{(f) => <Input {...f} value={fullName} onChange={(e) => setFullName(e.target.value)} />}</FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('customer.type')}>
          {(f) => (
            <OptionSelect
              {...f}
              value={type}
              onValueChange={(v) => isCustomerType(v) && setType(v)}
              options={CUSTOMER_TYPES.map((ct) => ({ value: ct, label: label('customerType', ct) }))}
            />
          )}
        </FormField>
        <FormField label={t('customer.priceGroup')}>
          {(f) => (
            <OptionSelect
              {...f}
              value={priceGroupId}
              onValueChange={setPriceGroupId}
              emptyLabel={t('customer.retail')}
              options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
            />
          )}
        </FormField>
      </div>
      {type === 'COMPANY' && (
        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('customer.companyName')}>{(f) => <Input {...f} value={companyName} onChange={(e) => setCompanyName(e.target.value)} />}</FormField>
          <FormField label={t('customer.inn')} error={innInvalid ? t('errors.validation') : null}>
            {(f) => <Input {...f} inputMode="numeric" maxLength={9} value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, ''))} />}
          </FormField>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('customer.creditLimit')} hint={admin ? undefined : t('customer.onlySuperAdmin')}>
          {(f) => (admin ? <MoneyInput {...f} value={creditLimit} onChange={setCreditLimit} /> : <Input {...f} disabled value={money(creditLimit)} />)}
        </FormField>
        <FormField label={t('customer.termDays')}>
          {(f) => <Input {...f} disabled={!admin} inputMode="numeric" value={termDays} onChange={(e) => setTermDays(e.target.value.replace(/\D/g, ''))} />}
        </FormField>
      </div>
      <div className="grid gap-1.5">
        <Label>{t('customer.allowedMethods')}</Label>
        <ChipGroup
          label={t('customer.allowedMethods')}
          value={methods}
          onChange={setMethods}
          options={PAYMENT_METHODS.map((m) => ({ value: m, label: label('paymentMethod', m) }))}
        />
      </div>
      <SwitchField checked={isActive} onCheckedChange={setIsActive} label={isActive ? t('common.active') : t('customer.blocked')} />
      <Button className="w-full" loading={save.isPending} disabled={!methods.length || innInvalid} onClick={() => save.mutate(undefined)}>
        {t('common.save')}
      </Button>
    </SectionCard>
  );
}
