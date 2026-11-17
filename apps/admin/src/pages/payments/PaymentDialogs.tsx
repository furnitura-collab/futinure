import { useState, type ReactNode } from 'react';
import { AuthFile } from '@/components/AuthFile';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { PaymentRow } from '@/lib/types';

/** Chek oynada: yangi tabga o'tmasdan ko'rib, shu yerning o'zida tasdiqlash/rad etish */
export function ReceiptDialog({
  payment,
  mimeType,
  actions,
  onClose,
}: {
  payment: PaymentRow;
  mimeType: string;
  actions?: ReactNode;
  onClose: () => void;
}) {
  const { t, money } = useI18n();
  return (
    <FormDialog onClose={onClose} title={t('payments.receiptTitle', { amount: money(payment.amount) })} footer={actions || undefined}>
      <div className="flex justify-center">
        <AuthFile path={`/payments/${payment.id}/receipt`} mimeType={mimeType} className="max-h-[65vh] w-full object-contain" />
      </div>
    </FormDialog>
  );
}

export function RejectDialog({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const { t, money } = useI18n();
  const [reason, setReason] = useState('');
  const reject = useApiMutation(() => api(`/admin/payments/${payment.id}/reject`, { body: { reason: reason.trim() } }), {
    invalidate: [['payments']],
    success: t('payments.rejectedToast'),
    onSuccess: onClose,
  });
  return (
    <FormDialog
      onClose={onClose}
      title={t('payments.rejectTitle', { amount: money(payment.amount) })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate(undefined)}>
            {t('payments.reject')}
          </Button>
        </>
      }
    >
      <FormField label={t('payments.reasonLabel')}>
        {(f) => <Textarea {...f} rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('payments.reasonPlaceholder')} />}
      </FormField>
    </FormDialog>
  );
}
