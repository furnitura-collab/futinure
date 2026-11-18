import { Link } from 'react-router';
import { BalanceText } from '@/components/BalanceText';
import { Inset } from '@/components/Inset';
import { PhoneLine } from '@/components/PhoneLine';
import { SectionCard } from '@/components/SectionCard';
import { TotalsList } from '@/components/TotalsList';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import type { OrderDetail } from '@/lib/types';

export function CustomerCard({ order }: { order: OrderDetail }) {
  const { t, money } = useI18n();
  const { can } = useAuth();
  const c = order.customer;
  const p = c.customerProfile;
  const name = c.fullName ?? '—';
  return (
    <SectionCard title={t('order.customer')} contentClassName="space-y-1.5 text-sm">
      {can('customers.manage') ? (
        <Link to={`/customers/${order.customerId}`} className="block font-medium hover:text-primary hover:underline">
          {name}
        </Link>
      ) : (
        <p className="font-medium">{name}</p>
      )}
      {p?.companyName && (
        <p>
          {p.companyName}
          {p.inn && <span className="text-muted-foreground"> · {t('order.inn', { inn: p.inn })}</span>}
        </p>
      )}
      <PhoneLine phone={c.phone} />
      <p className="text-xs text-muted-foreground">
        {t('order.ordersCount', { n: c._count.orders })}
        {p?.priceGroup && ` · ${t('order.priceGroup', { name: p.priceGroup.name })}`}
      </p>
      {p && p.balanceCached !== null && (
        <Inset className="mt-2">
          <TotalsList
            className="text-xs"
            rows={[
              { label: t('order.balance'), value: <BalanceText value={p.balanceCached} /> },
              { label: t('order.creditLimit'), value: money(p.creditLimit ?? 0) },
            ]}
          />
        </Inset>
      )}
      {order.creditCheck?.exceeds && (
        <p className="pt-1 text-xs font-medium text-destructive">{t('order.limitExceeded', { amount: money(order.creditCheck.exposureAfter) })}</p>
      )}
    </SectionCard>
  );
}
