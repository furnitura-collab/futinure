import { useQuery } from '@tanstack/react-query';
import { Columns3, List, MessageCircle, Search, Store, Truck } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useDebounced } from '../../lib/hooks';
import { ago, dateTime, phone, som } from '../../lib/format';
import { STATUS, TERMS } from '../../lib/labels';
import type { KanbanColumn, OrderCard, Paginated } from '../../lib/types';
import { Badge, Button, cx, Empty, ErrorBox, Input, PageLoader, Select } from '../../components/ui';

type Scope = 'all' | 'mine' | 'none';

export function OrdersPage() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'list' ? 'list' : 'board';
  const scope = (params.get('scope') as Scope) ?? 'all';
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q.trim());

  const filters = {
    q: query.length >= 2 ? query : undefined,
    managerId: scope === 'mine' ? me?.id : scope === 'none' ? 'none' : undefined,
  };
  const set = (k: string, v: string | null) =>
    setParams((p) => {
      if (v) p.set(k, v);
      else p.delete(k);
      return p;
    });

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 bg-white px-6 py-4">
        <h1 className="mr-auto text-xl font-semibold">Buyurtmalar</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-stone-400" />
          <Input className="w-72 pl-9" placeholder="Raqam, mijoz, firma, telefon" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-52" value={scope} onChange={(e) => set('scope', e.target.value === 'all' ? null : e.target.value)}>
          <option value="all">Barcha menejerlar</option>
          <option value="mine">Menikilar</option>
          <option value="none">Biriktirilmagan</option>
        </Select>
        <div className="flex rounded-lg ring-1 ring-stone-300">
          <Button variant={view === 'board' ? 'secondary' : 'ghost'} size="sm" className="rounded-r-none" onClick={() => set('view', null)}>
            <Columns3 className="size-4" /> Kanban
          </Button>
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" className="rounded-l-none" onClick={() => set('view', 'list')}>
            <List className="size-4" /> Jadval
          </Button>
        </div>
      </header>
      {view === 'board' ? <Board filters={filters} /> : <Table filters={filters} />}
    </div>
  );
}

type Filters = { q?: string; managerId?: string };

function Board({ filters }: { filters: Filters }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['orders', 'kanban', filters],
    queryFn: () => api<KanbanColumn[]>('/admin/orders/kanban', { query: filters }),
  });
  if (isPending) return <PageLoader />;
  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;

  return (
    <div className="flex flex-1 gap-4 overflow-x-auto p-6">
      {data.map((col) => (
        <section key={col.status} className="flex w-72 shrink-0 flex-col rounded-xl bg-stone-100/80">
          <header className="flex items-center justify-between px-3 py-2.5">
            <Badge tone={STATUS[col.status].tone}>{STATUS[col.status].label}</Badge>
            <span className="text-xs font-medium text-stone-500">{col.total}</span>
          </header>
          <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
            {col.items.map((o) => (
              <OrderCardView key={o.id} order={o} />
            ))}
            {col.total > col.items.length && (
              <p className="py-2 text-center text-xs text-stone-500">yana {col.total - col.items.length} ta — jadvalda ko'ring</p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function OrderCardView({ order: o }: { order: OrderCard }) {
  const name = o.customer.customerProfile?.companyName || o.customer.fullName || phone(o.customer.phone);
  const waitingQuote = o.status === 'QUOTED' && o.currentQuote?.status === 'PENDING';
  return (
    <Link
      to={`/orders/${o.id}`}
      className="block rounded-lg border border-stone-200 bg-white p-3 shadow-sm transition hover:border-brand-500 hover:shadow"
    >
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span className="font-mono font-medium text-stone-700">{o.number}</span>
        <span title={dateTime(o.updatedAt)}>{ago(o.updatedAt)}</span>
      </div>
      <p className="mt-1.5 truncate text-sm font-medium">{name}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-sm font-semibold">{som(o.grandTotal)}</span>
        <span className="flex items-center gap-2 text-stone-400">
          {o.deliveryType === 'DELIVERY' ? <Truck className="size-4" /> : <Store className="size-4" />}
          {o.unreadMessages > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-brand-600 px-1.5 text-xs font-semibold text-white">
              <MessageCircle className="size-3" /> {o.unreadMessages}
            </span>
          )}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {waitingQuote && <Badge tone="bg-violet-50 text-violet-700 ring-violet-200">Javob kutilmoqda</Badge>}
        {o.paymentTerms && <Badge tone="bg-stone-50 text-stone-600 ring-stone-200">{TERMS[o.paymentTerms]}</Badge>}
        {o.balanceDue > 0 && o.paidTotal > 0 && <Badge tone="bg-amber-50 text-amber-700 ring-amber-200">Qoldiq {som(o.balanceDue)}</Badge>}
        {!o.manager && <Badge tone="bg-rose-50 text-rose-700 ring-rose-200">Menejer yo'q</Badge>}
      </div>
    </Link>
  );
}

function Table({ filters }: { filters: Filters }) {
  const [page, setPage] = useState(1);
  const { data, isPending, error } = useQuery({
    queryKey: ['orders', 'list', filters, page],
    queryFn: () => api<Paginated<OrderCard>>('/admin/orders', { query: { ...filters, page, limit: 30 } }),
    placeholderData: (prev) => prev,
  });
  if (isPending) return <PageLoader />;
  if (error) return <div className="p-6"><ErrorBox error={error} /></div>;
  if (!data.items.length) return <div className="p-6"><Empty>Buyurtmalar topilmadi</Empty></div>;
  const pages = Math.ceil(data.total / data.limit);

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-500 uppercase">
            <tr>
              <th className="px-4 py-3">Raqam</th>
              <th className="px-4 py-3">Mijoz</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Jami</th>
              <th className="px-4 py-3 text-right">To'langan</th>
              <th className="px-4 py-3">Menejer</th>
              <th className="px-4 py-3">Sana</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {data.items.map((o) => (
              <tr key={o.id} className="hover:bg-stone-50">
                <td className="px-4 py-3 font-mono">
                  <Link to={`/orders/${o.id}`} className="text-brand-700 hover:underline">{o.number}</Link>
                </td>
                <td className="px-4 py-3">
                  <div>{o.customer.customerProfile?.companyName || o.customer.fullName || '—'}</div>
                  <div className="text-xs text-stone-500">{phone(o.customer.phone)}</div>
                </td>
                <td className="px-4 py-3"><Badge tone={STATUS[o.status].tone}>{STATUS[o.status].label}</Badge></td>
                <td className="px-4 py-3 text-right font-medium">{som(o.grandTotal)}</td>
                <td className={cx('px-4 py-3 text-right', o.balanceDue > 0 && o.status !== 'CANCELLED' && 'text-amber-700')}>
                  {som(o.paidTotal)}
                </td>
                <td className="px-4 py-3 text-stone-600">{o.manager?.fullName ?? '—'}</td>
                <td className="px-4 py-3 text-stone-500">{dateTime(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Oldingi</Button>
          <span className="text-stone-500">{page} / {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Keyingi</Button>
        </div>
      )}
    </div>
  );
}
