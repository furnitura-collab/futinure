import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '@mebel/shared';
import { BalanceText } from '@/components/BalanceText';
import { Callout } from '@/components/Callout';
import { ErrorState } from '@/components/ErrorState';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import type { Reconciliation } from '@/lib/types';

/** Akt-sverka: davr bo'yicha debet/kredit va qoldiqlar. Chop etishda faqat shu blok chiqadi (#print-area) */
export function ReconciliationView({ customerId }: { customerId: string }) {
  const { t, money } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['reconciliation', customerId, from, to],
    queryFn: () => api<Reconciliation>(`/admin/customers/${customerId}/reconciliation`, { query: { from, to } }),
    enabled: from <= to,
  });

  const customer = data?.customer;
  const row = 'border-b border-border print:border-black/20';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <FormField label={t('common.from')}>{(f) => <Input {...f} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</FormField>
        <FormField label={t('common.to')}>{(f) => <Input {...f} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</FormField>
        <Button variant="outline" onClick={() => window.print()} disabled={!data}>
          <Printer /> {t('common.print')}
        </Button>
      </div>
      {from > to ? (
        <Callout tone="destructive">{t('recon.invalidRange')}</Callout>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending || !data ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <Card id="print-area" className="gap-0 p-6 text-sm">
          <h3 className="text-center text-base font-semibold">{t('recon.title')}</h3>
          <p className="mt-1 text-center text-muted-foreground">
            {customer?.customerProfile?.companyName || customer?.fullName}
            {customer?.customerProfile?.inn && `, ${t('recon.inn', { inn: customer.customerProfile.inn })}`} · {formatDate(data.period.from)} —{' '}
            {formatDate(data.period.to)}
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem]">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className={row}>
                  <th className="py-2 font-medium">{t('common.date')}</th>
                  <th className="py-2 font-medium">{t('recon.doc')}</th>
                  <th className="py-2 text-right font-medium">{t('recon.debit')}</th>
                  <th className="py-2 text-right font-medium">{t('recon.credit')}</th>
                </tr>
              </thead>
              <tbody className="tabular">
                <tr className={`${row} font-medium`}>
                  <td className="py-2" colSpan={2}>
                    {t('recon.opening')}
                  </td>
                  <td className="py-2 text-right" colSpan={2}>
                    <BalanceText value={data.openingBalance} />
                  </td>
                </tr>
                {data.entries.map((e) => (
                  <tr key={e.id} className={row}>
                    <td className="py-1.5 whitespace-nowrap">{formatDate(e.createdAt)}</td>
                    <td className="py-1.5">{e.description}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">{e.amount > 0 ? money(e.amount) : ''}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">{e.amount < 0 ? money(-e.amount) : ''}</td>
                  </tr>
                ))}
                <tr className={`${row} font-medium`}>
                  <td className="py-2" colSpan={2}>
                    {t('recon.turnover')}
                  </td>
                  <td className="py-2 text-right whitespace-nowrap">{money(data.totalDebit)}</td>
                  <td className="py-2 text-right whitespace-nowrap">{money(data.totalCredit)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-2" colSpan={2}>
                    {t('recon.closing')}
                  </td>
                  <td className="py-2 text-right" colSpan={2}>
                    <BalanceText value={data.closingBalance} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
