import { useState } from 'react';
import { PAYMENT_METHODS, type PaymentMethod } from '@mebel/shared';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { MoneyInput } from '@/components/MoneyInput';
import { OptionSelect } from '@/components/OptionSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { OrderDetail } from '@/lib/types';

const isMethod = (v: string): v is PaymentMethod => (PAYMENT_METHODS as readonly string[]).includes(v);

/** Menejer qo'lida olgan pul (naqd, bank) — darhol tasdiqlangan bo'ladi */
export function RecordPaymentDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const { t, money, label } = useI18n();
  const [amount, setAmount] = useState(Math.max(0, order.balanceDue));
  const [method, setMethod] = useState<PaymentMethod>(order.allowedMethods.includes('CASH') ? 'CASH' : (order.allowedMethods[0] ?? 'CASH'));
  const [comment, setComment] = useState('');
  const record = useApiMutation(
    () => api('/admin/payments', { body: { customerId: order.customerId, orderId: order.id, amount, method, comment: comment.trim() || undefined } }),
    { invalidate: [['order', order.id], ['orders'], ['payments']], success: t('recordPayment.done', { amount: money(amount) }), onSuccess: onClose },
  );
  return (
    <FormDialog
      onClose={onClose}
      title={t('recordPayment.title', { number: order.number })}
      description={t('recordPayment.hint', { amount: money(order.balanceDue) })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={record.isPending} disabled={amount <= 0} onClick={() => record.mutate(undefined)}>
            {t('recordPayment.submit')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('common.amount')}>{(f) => <MoneyInput {...f} autoFocus value={amount} onChange={setAmount} />}</FormField>
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
        <FormField label={t('common.comment')}>{(f) => <Input {...f} value={comment} onChange={(e) => setComment(e.target.value)} />}</FormField>
      </div>
    </FormDialog>
  );
}
