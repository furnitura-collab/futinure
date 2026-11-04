import { useQuery } from '@tanstack/react-query';
import { Check, MessageSquareText, ReceiptText, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDateTime, formatPhone, type PaymentStatus } from '@mebel/shared';
import { AuthFile } from '@/components/AuthFile';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useI18n, type TKey } from '@/i18n';
import { api } from '@/lib/api';
import { customerName } from '@/lib/format';
import { useApiMutation } from '@/lib/mutation';
import type { Paginated, PaymentRow } from '@/lib/types';

type Tab = PaymentStatus | 'ALL';
const TABS: { value: Tab; label: TKey }[] = [
  { value: 'PENDING', label: 'payments.pending' },
  { value: 'CONFIRMED', label: 'payments.confirmed' },
  { value: 'REJECTED', label: 'payments.rejected' },
  { value: 'ALL', label: 'payments.all' },
];
const isTab = (v: string): v is Tab => TABS.some((x) => x.value === v);

export function PaymentsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [page, setPage] = useState(1);
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['payments', tab, page],
    queryFn: () => api<Paginated<PaymentRow>>('/admin/payments', { query: { status: tab === 'ALL' ? undefined : tab, page, limit: 20 } }),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t('payments.title')} description={t('payments.subtitle')} />
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (!isTab(v)) return;
          setTab(v);
          setPage(1);
        }}
        className="mb-4"
      >
        <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
          {TABS.map((x) => (
            <TabsTrigger key={x.value} value={x.value} className="flex-none">
              {t(x.label)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={tab === 'PENDING' ? t('payments.emptyPending') : t('payments.empty')}
          description={tab === 'PENDING' ? t('payments.emptyPendingHint') : undefined}
        />
      ) : (
        <div className={isFetching ? 'space-y-3 opacity-60 transition-opacity' : 'space-y-3 transition-opacity'}>
          {data.items.map((p) => (
            <PaymentCard key={p.id} payment={p} />
          ))}
        </div>
      )}

      {data && <Pagination className="mt-4" page={page} total={data.total} limit={data.limit} onPage={setPage} />}
    </div>
  );
}

function PaymentCard({ payment: p }: { payment: PaymentRow }) {
  const { t, money, label } = useI18n();
  const [showReceipt, setShowReceipt] = useState(p.status === 'PENDING');
  const [rejecting, setRejecting] = useState(false);
  const confirm = useApiMutation(() => api(`/admin/payments/${p.id}/confirm`, { method: 'POST' }), {
    invalidate: [['payments'], ['orders'], ...(p.orderId ? [['order', p.orderId]] : [])],
    success: t('payments.confirmedToast', { amount: money(p.amount) }),
  });
  const due = p.order ? p.order.grandTotal - p.order.paidTotal : null;

  return (
    <Card className="animate-fade-up flex-col gap-4 p-4 sm:flex-row">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-semibold tabular">{money(p.amount)}</span>
          <StatusBadge kind="paymentStatus" value={p.status} />
          <span className="text-sm text-muted-foreground">{label('paymentMethod', p.method)}</span>
        </div>
        {p.customer && (
          <p className="text-sm">
            {customerName(p.customer)} · <span className="text-muted-foreground">{formatPhone(p.customer.phone)}</span>
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {p.order ? (
            <>
              {t('payments.order')}{' '}
              <Link to={`/orders/${p.order.id}`} className="font-mono text-primary hover:underline">
                {p.order.number}
              </Link>
              {p.status === 'PENDING' && due !== null && ` · ${t('payments.dueLeft', { amount: money(due) })}`}
            </>
          ) : (
            t('payments.general')
          )}
        </p>
        <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
        {p.comment && (
          <p className="flex gap-1.5 text-sm">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {p.comment}
          </p>
        )}
        {p.rejectReason && <p className="text-sm text-destructive">{t('payments.rejectReason', { reason: p.rejectReason })}</p>}

        {p.status === 'PENDING' && (
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(undefined)}>
              <Check /> {t('payments.confirm')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
              <X /> {t('payments.reject')}
            </Button>
          </div>
        )}
      </div>
      {p.receipt && (
        <div className="w-full shrink-0 sm:w-56">
          {showReceipt ? (
            <AuthFile path={`/payments/${p.id}/receipt`} mimeType={p.receipt.mimeType} className="max-h-72 w-full object-contain" />
          ) : (
            <Button variant="outline" size="sm" onClick={() => setShowReceipt(true)}>
              <ReceiptText /> {t('payments.showReceipt')}
            </Button>
          )}
        </div>
      )}
      {rejecting && <RejectDialog payment={p} onClose={() => setRejecting(false)} />}
    </Card>
  );
}

function RejectDialog({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
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
