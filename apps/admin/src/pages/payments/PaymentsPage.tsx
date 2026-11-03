import { useQuery } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { PaymentStatus } from '@mebel/shared';
import { api } from '../../lib/api';
import { dateTime, phone, som } from '../../lib/format';
import { METHOD, PAYMENT_STATUS } from '../../lib/labels';
import { useApiMutation } from '../../lib/mutation';
import type { Paginated, PaymentRow } from '../../lib/types';
import { AuthFile } from '../../components/AuthFile';
import { Badge, Button, cx, Dialog, Empty, ErrorBox, Field, PageLoader, Textarea } from '../../components/ui';

const TABS: { status: PaymentStatus | 'ALL'; label: string }[] = [
  { status: 'PENDING', label: 'Tekshirish kerak' },
  { status: 'CONFIRMED', label: 'Tasdiqlangan' },
  { status: 'REJECTED', label: 'Rad etilgan' },
  { status: 'ALL', label: 'Barchasi' },
];

export function PaymentsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]['status']>('PENDING');
  const [page, setPage] = useState(1);
  const { data, isPending, error } = useQuery({
    queryKey: ['payments', tab, page],
    queryFn: () =>
      api<Paginated<PaymentRow>>('/admin/payments', { query: { status: tab === 'ALL' ? undefined : tab, page, limit: 20 } }),
    placeholderData: (prev) => prev,
  });
  const pages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">To'lovlar</h1>
      <div className="flex gap-1 border-b border-stone-200">
        {TABS.map((t) => (
          <button
            key={t.status}
            onClick={() => {
              setTab(t.status);
              setPage(1);
            }}
            className={cx(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.status ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-500 hover:text-stone-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <PageLoader />
      ) : error ? (
        <ErrorBox error={error} />
      ) : data.items.length === 0 ? (
        <Empty>{tab === 'PENDING' ? 'Tekshiriladigan chek yo\'q' : 'To\'lov yo\'q'}</Empty>
      ) : (
        <div className="space-y-3">
          {data.items.map((p) => (
            <PaymentCard key={p.id} payment={p} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Oldingi</Button>
          <span className="text-stone-500">{page} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Keyingi</Button>
        </div>
      )}
    </div>
  );
}

function PaymentCard({ payment: p }: { payment: PaymentRow }) {
  const [showReceipt, setShowReceipt] = useState(p.status === 'PENDING');
  const [rejecting, setRejecting] = useState(false);
  const confirm = useApiMutation(() => api(`/admin/payments/${p.id}/confirm`, { method: 'POST' }), {
    invalidate: [['payments'], ['orders'], ...(p.orderId ? [['order', p.orderId]] : [])],
    success: `${som(p.amount)} tasdiqlandi`,
  });
  const c = p.customer!;
  const due = p.order ? p.order.grandTotal - p.order.paidTotal : null;

  return (
    <div className="flex gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{som(p.amount)}</span>
          <Badge tone={PAYMENT_STATUS[p.status].tone}>{PAYMENT_STATUS[p.status].label}</Badge>
          <span className="text-sm text-stone-500">{METHOD[p.method]}</span>
        </div>
        <p className="text-sm">
          {c.customerProfile?.companyName || c.fullName || '—'} · <span className="text-stone-500">{phone(c.phone)}</span>
        </p>
        <p className="text-sm text-stone-600">
          {p.order ? (
            <>
              Buyurtma{' '}
              <Link to={`/orders/${p.order.id}`} className="font-mono text-brand-700 hover:underline">{p.order.number}</Link>
              {p.status === 'PENDING' && due !== null && <> · qoldiq {som(due)}</>}
            </>
          ) : (
            'Umumiy qarzga'
          )}
        </p>
        <p className="text-xs text-stone-500">{dateTime(p.createdAt)}</p>
        {p.comment && <p className="text-sm">💬 {p.comment}</p>}
        {p.rejectReason && <p className="text-sm text-rose-700">Rad etish sababi: {p.rejectReason}</p>}

        {p.status === 'PENDING' && (
          <div className="flex gap-2 pt-2">
            <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(undefined)}>
              <Check className="size-4" /> Pul tushdi — tasdiqlash
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setRejecting(true)}>
              <X className="size-4" /> Rad etish
            </Button>
          </div>
        )}
      </div>
      {p.receipt && (
        <div className="w-56 shrink-0">
          {showReceipt ? (
            <AuthFile path={`/payments/${p.id}/receipt`} mimeType={p.receipt.mimeType} className="max-h-72 w-full rounded-lg object-contain ring-1 ring-stone-200" />
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setShowReceipt(true)}>Chekni ko'rish</Button>
          )}
        </div>
      )}
      {rejecting && <RejectDialog payment={p} onClose={() => setRejecting(false)} />}
    </div>
  );
}

function RejectDialog({ payment, onClose }: { payment: PaymentRow; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const reject = useApiMutation(() => api(`/admin/payments/${payment.id}/reject`, { body: { reason: reason.trim() } }), {
    invalidate: [['payments']],
    success: 'To\'lov rad etildi',
    onSuccess: onClose,
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${som(payment.amount)} — rad etish`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Bekor</Button>
          <Button variant="danger" loading={reject.isPending} disabled={reason.trim().length < 3} onClick={() => reject.mutate(undefined)}>
            Rad etish
          </Button>
        </>
      }
    >
      <Field label="Sabab (mijozga ko'rinadi)">
        {(id) => (
          <Textarea id={id} rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: chekdagi summa boshqa / pul tushmagan" />
        )}
      </Field>
    </Dialog>
  );
}
