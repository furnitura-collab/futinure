import { useState } from 'react';
import { PAYMENT_METHODS, type PaymentMethod } from '@mebel/shared';
import { api } from '../../lib/api';
import { som } from '../../lib/format';
import { METHOD } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { OrderDetail } from '../../lib/types';
import { Button, Dialog, Field, Input, Select } from '../../components/ui';
import { MoneyInput } from './TermsForm';

/** Menejer qo'lida olgan pul (naqd, bank) — darhol tasdiqlangan bo'ladi */
export function RecordPaymentDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const [amount, setAmount] = useState(Math.max(0, order.balanceDue));
  const [method, setMethod] = useState<PaymentMethod>(order.allowedMethods.includes('CASH') ? 'CASH' : (order.allowedMethods[0] ?? 'CASH'));
  const [comment, setComment] = useState('');
  const record = useApiMutation(
    () => api('/admin/payments', { body: { customerId: order.customerId, orderId: order.id, amount, method, comment: comment.trim() || undefined } }),
    { invalidate: [['order', order.id], ['orders'], ['payments']], success: `${som(amount)} kiritildi`, onSuccess: onClose },
  );
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${order.number}: to'lov kiritish`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button loading={record.isPending} disabled={amount <= 0} onClick={() => record.mutate(undefined)}>Kiritish</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-stone-600">Qoldiq: {som(order.balanceDue)}. Bu to'lov darhol tasdiqlangan hisoblanadi.</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Summa">{(id) => <MoneyInput id={id} value={amount} onChange={setAmount} />}</Field>
          <Field label="Usul">
            {(id) => (
              <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{METHOD[m]}</option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Izoh">{(id) => <Input id={id} value={comment} onChange={(e) => setComment(e.target.value)} />}</Field>
      </div>
    </Dialog>
  );
}
