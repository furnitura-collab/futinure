import { useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime, formatPhone } from '@mebel/shared';
import { IconButton } from '@/components/IconButton';
import { StatusBadge } from '@/components/StatusBadge';
import { ReceiptText } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { customerName } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import type { PaymentRow } from '@/lib/types';
import { ReceiptDialog, RejectDialog } from './PaymentDialogs';

// Telefonda juftlik tugmalari teng bo'linadi va kattaroq (bosh barmoq uchun)
const PAIR = 'max-sm:h-10 max-sm:flex-1';

/**
 * Zich qator: 1-qator — summa, holat, usul, mijoz; 2-qator — buyurtma, qoldiq, sana; izoh/sabab — kerak bo'lsa.
 * Telefonda mijoz alohida qatorda, Rad etish / Tasdiqlash — pastda teng kenglikdagi juftlik (bosh barmoq yetadi).
 */
export function PaymentItem({ payment: p }: { payment: PaymentRow }) {
  const { t, money, label } = useI18n();
  const [dialog, setDialog] = useState<'receipt' | 'reject' | null>(null);
  const confirm = useApiMutation(() => api(`/admin/payments/${p.id}/confirm`, { method: 'POST' }), {
    invalidate: [['payments'], ['orders'], ...(p.orderId ? [['order', p.orderId]] : [])],
    success: t('payments.confirmedToast', { amount: money(p.amount) }),
    onSuccess: () => setDialog(null),
  });
  const pending = p.status === 'PENDING';
  const due = p.order ? p.order.grandTotal - p.order.paidTotal : null;

  const decide = pending && (
    <>
      <Button size="sm" variant="ghost-destructive" className={PAIR} onClick={() => setDialog('reject')}>
        {t('payments.reject')}
      </Button>
      <Button size="sm" className={PAIR} loading={confirm.isPending} onClick={() => confirm.mutate(undefined)}>
        {t('payments.confirm')}
      </Button>
    </>
  );

  return (
    <li className="flex animate-fade-up flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-2">
      <div className="min-w-0 flex-1 space-y-1 sm:space-y-0.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold tabular max-sm:text-base">{money(p.amount)}</span>
          <StatusBadge kind="paymentStatus" value={p.status} />
          <span className="text-xs text-muted-foreground max-sm:ml-auto">{label('paymentMethod', p.method)}</span>
          {p.customer && (
            <Link to={`/customers/${p.customerId}`} className="min-w-0 truncate text-sm hover:text-primary hover:underline max-sm:w-full">
              {customerName(p.customer)} <span className="text-muted-foreground">· {formatPhone(p.customer.phone)}</span>
            </Link>
          )}
        </div>
        <p className="flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
          {p.order ? (
            <span>
              {t('payments.order')}{' '}
              <Link to={`/orders/${p.order.id}`} className="font-mono text-primary hover:underline">
                {p.order.number}
              </Link>
              {pending && due !== null && ` · ${t('payments.dueLeft', { amount: money(due) })}`}
            </span>
          ) : (
            <span>{t('payments.general')}</span>
          )}
          <span>· {formatDateTime(p.createdAt)}</span>
        </p>
        {p.comment && <p className="text-sm">{p.comment}</p>}
        {p.rejectReason && <p className="text-sm text-destructive">{t('payments.rejectReason', { reason: p.rejectReason })}</p>}
      </div>
      {(p.receipt || pending) && (
        <div className="flex shrink-0 items-center gap-1.5 max-sm:w-full">
          {p.receipt && <IconButton icon={ReceiptText} label={t('payments.showReceipt')} variant="outline" className="max-sm:size-10" onClick={() => setDialog('receipt')} />}
          {decide}
        </div>
      )}
      {dialog === 'receipt' && p.receipt && (
        <ReceiptDialog
          payment={p}
          mimeType={p.receipt.mimeType}
          actions={decide && <div className="flex w-full gap-2 sm:w-auto">{decide}</div>}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'reject' && <RejectDialog payment={p} onClose={() => setDialog(null)} />}
    </li>
  );
}
