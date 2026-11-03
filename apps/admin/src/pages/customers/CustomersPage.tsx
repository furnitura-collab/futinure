import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { usePriceGroups } from '../../lib/catalog';
import { dateTime, phone, som } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import type { CustomerRow, Paginated } from '../../lib/types';
import { Badge, cx, Empty, ErrorBox, Input, PageHeader, PageLoader, Pagination, Select, Toggle } from '../../components/ui';

export const CUSTOMER_TYPE = { INDIVIDUAL: 'Jismoniy shaxs', MASTER: 'Usta', COMPANY: 'Firma' } as const;

/** Balans: musbat — qarz, manfiy — haqdor */
export function BalanceText({ value }: { value: number }) {
  if (value > 0) return <span className="font-medium text-amber-700">qarz {som(value)}</span>;
  if (value < 0) return <span className="font-medium text-emerald-700">haqdor {som(-value)}</span>;
  return <span className="text-stone-400">0</span>;
}

export function CustomersPage() {
  const navigate = useNavigate();
  const groups = usePriceGroups();
  const [q, setQ] = useState('');
  const [priceGroupId, setPriceGroupId] = useState('');
  const [debtors, setDebtors] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [page, setPage] = useState(1);
  const query = useDebounced(q.trim());
  const filters = {
    q: query.length >= 2 ? query : undefined,
    priceGroupId: priceGroupId || undefined,
    debtors: debtors || undefined,
    overdue: overdue || undefined,
  };
  const { data, isPending, error } = useQuery({
    queryKey: ['customers', filters, page],
    queryFn: () => api<Paginated<CustomerRow>>('/admin/customers', { query: { ...filters, page, limit: 30 } }),
    placeholderData: (prev) => prev,
  });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Mijozlar" />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-stone-400" />
            <Input className="w-72 pl-9" placeholder="Ism, firma, STIR, telefon" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
          </div>
          <Select className="w-44" value={priceGroupId} onChange={(e) => reset(setPriceGroupId)(e.target.value)}>
            <option value="">Barcha guruhlar</option>
            {groups.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Toggle checked={debtors} onChange={reset(setDebtors)} label="Qarzdorlar" />
          <Toggle checked={overdue} onChange={reset(setOverdue)} label="Muddati o'tgan" />
        </div>

        {isPending ? (
          <PageLoader />
        ) : error ? (
          <ErrorBox error={error} />
        ) : data.items.length === 0 ? (
          <Empty>Mijoz topilmadi</Empty>
        ) : (
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Mijoz</th>
                  <th className="px-4 py-3">Turi / guruh</th>
                  <th className="px-4 py-3 text-right">Balans</th>
                  <th className="px-4 py-3 text-right">Limit</th>
                  <th className="px-4 py-3 text-right">Buyurtmalar</th>
                  <th className="px-4 py-3">Oxirgi kirish</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.items.map((c) => {
                  const p = c.customerProfile;
                  return (
                    <tr key={c.id} className={cx('cursor-pointer hover:bg-stone-50', !c.isActive && 'opacity-50')} onClick={() => navigate(`/customers/${c.id}`)}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{p?.companyName || c.fullName || '—'}</p>
                        <p className="text-xs text-stone-500">
                          {p?.companyName && c.fullName ? `${c.fullName} · ` : ''}{phone(c.phone)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {p ? CUSTOMER_TYPE[p.type] : '—'}
                        {p?.priceGroup && <Badge tone="ml-2 bg-brand-50 text-brand-700 ring-brand-100">{p.priceGroup.name}</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right"><BalanceText value={p?.balanceCached ?? 0} /></td>
                      <td className="px-4 py-3 text-right text-stone-600">{p?.creditLimit ? som(p.creditLimit) : '—'}</td>
                      <td className="px-4 py-3 text-right">{c._count.orders}</td>
                      <td className="px-4 py-3 text-stone-500">{dateTime(c.lastLoginAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={page} total={data.total} limit={data.limit} onPage={setPage} />}
      </div>
    </div>
  );
}
