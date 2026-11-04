import { useState } from 'react';
import { PAYMENT_METHODS, type PaymentMethod } from '@mebel/shared';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { OptionSelect } from '@/components/OptionSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { CustomerDetail } from '@/lib/types';

const isMethod = (v: string): v is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(v);

function useLedgerMutation(c: CustomerDetail, fn: () => Promise<unknown>, success: string, onClose: () => void) {
  return useApiMutation(fn, { invalidate: [['customer', c.id], ['ledger', c.id], ['customers']], success, onSuccess: onClose });
}

export function RefundDialog({ customer: c, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const { t, money, label } = useI18n();
  const owed = -c.finance.balance;
  const [amount, setAmount] = useState(owed);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [description, setDescription] = useState('');
  const save = useLedgerMutation(
    c,
    () => api(`/admin/customers/${c.id}/refunds`, { body: { amount, method, description: description.trim() } }),
    t('refund.done'),
    onClose,
  );
  return (
    <FormDialog
      onClose={onClose}
      title={t('refund.title')}
      description={t('refund.owed', { amount: money(owed) })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={amount <= 0 || amount > owed || description.trim().length < 5} onClick={() => save.mutate(undefined)}>
            {t('refund.submit')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common.amount')}>{(f) => <MoneyInput {...f} value={amount} onChange={setAmount} />}</FormField>
          <FormField label={t('common.method')}>
            {(f) => (
              <OptionSelect
                {...f}
                value={method}
                onValueChange={(v) => isMethod(v) && setMethod(v)}
                options={PAYMENT_METHODS.map((m) => ({ value: m, label: label('paymentMethod', m) }))}
              />
            )}
          </FormField>
        </div>
        <FormField label={t('common.commentRequired')}>
          {(f) => <Input {...f} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('refund.placeholder')} />}
        </FormField>
      </div>
    </FormDialog>
  );
}

export function AdjustDialog({ customer: c, onClose }: { customer: CustomerDetail; onClose: () => void }) {
  const { t } = useI18n();
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const save = useLedgerMutation(
    c,
    () => api(`/admin/customers/${c.id}/ledger/adjust`, { body: { amount: sign * amount, description: description.trim() } }),
    t('adjust.done'),
    onClose,
  );
  return (
    <FormDialog
      onClose={onClose}
      title={t('adjust.title')}
      description={t('adjust.hint')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={amount <= 0 || description.trim().length < 5} onClick={() => save.mutate(undefined)}>
            {t('adjust.submit')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Tabs value={String(sign)} onValueChange={(v) => setSign(v === '-1' ? -1 : 1)}>
          <TabsList className="w-full">
            <TabsTrigger value="1">{t('adjust.increase')}</TabsTrigger>
            <TabsTrigger value="-1">{t('adjust.decrease')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <FormField label={t('common.amount')}>{(f) => <MoneyInput {...f} value={amount} onChange={setAmount} />}</FormField>
        <FormField label={t('common.commentRequired')}>{(f) => <Input {...f} value={description} onChange={(e) => setDescription(e.target.value)} />}</FormField>
      </div>
    </FormDialog>
  );
}
