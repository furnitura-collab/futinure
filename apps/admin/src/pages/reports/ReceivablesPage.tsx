import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { date, phone, som } from '../../lib/format';
import type { Receivables } from '../../lib/types';
import { cx, Empty, ErrorBox, PageHeader, PageLoader } from '../../components/ui';

/** Debitorlik: kim qancha qarz, qanchasi muddati o'tgan (eng xavflisi birinchi) */
export function ReceivablesPage() {
  const navigate = useNavigate();
  const { data, isPending, error } = useQuery({
    queryKey: ['receivables'],
    queryFn: () => api<Receivables>('/admin/reports/receivables'),
  });

  return (
    <div>
      <PageHeader title="Debitorlik qarzi" />
      <div className="space-y-4 p-6">
        {isPending ? (
          <PageLoader />
        ) : error ? (
          <ErrorBox error={error} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 md:max-w-xl">
              <div className="rounded-xl border border-stone-200 bg-white p-4">
                <p className="text-xs text-stone-500">Jami qarz</p>
                <p className="mt-1 text-xl font-semibold">{som(data.totalReceivable)}</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                <p className="text-xs text-rose-700">Muddati o'tgan</p>
                <p className="mt-1 text-xl font-semibold text-rose-700">{som(data.totalOverdue)}</p>
              </div>
            </div>
            {data.customers.length === 0 ? (
              <Empty>Qarzdor mijoz yo'q</Empty>
            ) : (
              <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-stone-50 text-left text-xs text-stone-500 uppercase">
                    <tr>
                      <th className="px-4 py-3">Mijoz</th>
                      <th className="px-4 py-3 text-right">Qarz</th>
                      <th className="px-4 py-3 text-right">Muddati o'tgan</th>
                      <th className="px-4 py-3">Eng eski muddat</th>
                      <th className="px-4 py-3 text-right">Limit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {data.customers.map((r) => (
                      <tr key={r.customer_id} className="cursor-pointer hover:bg-stone-50" onClick={() => navigate(`/customers/${r.customer_id}`)}>
                        <td className="px-4 py-3">
                          <p className="font-medium">{r.company_name || r.full_name || '—'}</p>
                          <p className="text-xs text-stone-500">{phone(r.phone)}</p>
                        </td>
                        <td className={cx('px-4 py-3 text-right font-medium', r.credit_limit > 0 && r.balance > r.credit_limit && 'text-rose-600')}>
                          {som(r.balance)}
                        </td>
                        <td className={cx('px-4 py-3 text-right', r.overdue > 0 ? 'font-semibold text-rose-600' : 'text-stone-400')}>{som(r.overdue)}</td>
                        <td className="px-4 py-3 text-stone-600">{date(r.oldest_due)}</td>
                        <td className="px-4 py-3 text-right text-stone-500">{som(r.credit_limit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
