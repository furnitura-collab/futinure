import { formatDate, formatDateTime } from '@mebel/shared';
import { Hint } from '@/components/IconButton';
import { Inset } from '@/components/Inset';
import { SectionCard } from '@/components/SectionCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import type { OrderDetail } from '@/lib/types';

/** To'lov: shartlar (bor bo'lsa) va kelgan to'lovlar bitta kartada */
export function PaymentCard({ order, onRecord }: { order: OrderDetail; onRecord?: () => void }) {
  const { t, money, label } = useI18n();
  const terms = order.paymentTerms;
  return (
    <SectionCard
      title={t('order.payments')}
      actions={
        onRecord && (
          <Button size="sm" variant="outline" onClick={onRecord}>
            {t('order.recordPayment')}
          </Button>
        )
      }
      contentClassName="space-y-3 text-sm"
    >
      {terms && (
        <Inset className="space-y-0.5 text-xs">
          <p className="text-sm font-medium">
            {label('paymentTerms', terms)}
            {terms === 'ADVANCE' && <span className="font-normal text-muted-foreground"> · {t('order.advance', { amount: money(order.advanceAmount) })}</span>}
          </p>
          <p className="text-muted-foreground">{order.allowedMethods.map((m) => label('paymentMethod', m)).join(', ')}</p>
          {order.dueDate && <p>{t('order.dueDate', { date: formatDate(order.dueDate) })}</p>}
        </Inset>
      )}
      {order.payments.length === 0 ? (
        <p className="text-muted-foreground">{t('order.noPayments')}</p>
      ) : (
        <ul className="divide-y">
          {order.payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
              <span className="min-w-0">
                <span className="font-medium tabular">{money(p.amount)}</span>{' '}
                <Hint label={formatDateTime(p.createdAt)}>
                  <span className="text-xs text-muted-foreground">{label('paymentMethod', p.method)}</span>
                </Hint>
              </span>
              <StatusBadge kind="paymentStatus" value={p.status} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
