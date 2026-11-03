import { useQuery } from '@tanstack/react-query';
import { ClipboardList, LogOut, Package, TrendingDown, Users, Wallet, Warehouse } from 'lucide-react';
import { NavLink, Navigate, Outlet } from 'react-router';
import type { Role } from '@mebel/shared';
import { api } from '../lib/api';
import { PANEL_ROLES, useAuth } from '../lib/auth';
import { ROLE } from '../lib/labels';
import { useRealtime } from '../lib/realtime';
import type { Paginated } from '../lib/types';
import { cx, PageLoader } from './ui';

const NAV: { to: string; label: string; icon: typeof ClipboardList; roles: Role[]; badge?: 'payments' }[] = [
  { to: '/orders', label: 'Buyurtmalar', icon: ClipboardList, roles: ['MANAGER', 'SUPER_ADMIN', 'WAREHOUSE'] },
  { to: '/payments', label: 'To\'lovlar', icon: Wallet, roles: ['MANAGER', 'SUPER_ADMIN'], badge: 'payments' },
  { to: '/catalog', label: 'Katalog', icon: Package, roles: ['MANAGER', 'SUPER_ADMIN'] },
  { to: '/stock', label: 'Ombor', icon: Warehouse, roles: ['MANAGER', 'SUPER_ADMIN', 'WAREHOUSE'] },
  { to: '/customers', label: 'Mijozlar', icon: Users, roles: ['MANAGER', 'SUPER_ADMIN'] },
  { to: '/reports/receivables', label: 'Debitorlik', icon: TrendingDown, roles: ['MANAGER', 'SUPER_ADMIN'] },
];

function usePendingPayments(enabled: boolean) {
  return useQuery({
    queryKey: ['payments', 'pending-count'],
    queryFn: () => api<Paginated<unknown>>('/admin/payments', { query: { status: 'PENDING', limit: 1 } }),
    select: (r) => r.total,
    enabled,
  });
}

export function Layout() {
  const { me, loading, logout, can } = useAuth();
  const { connected } = useRealtime();
  const pending = usePendingPayments(can('MANAGER', 'SUPER_ADMIN'));

  if (loading) return <PageLoader />;
  if (!me || !PANEL_ROLES.includes(me.role)) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8" />
          <span className="font-semibold">Mebel Order</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {NAV.filter((n) => n.roles.includes(me.role)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100',
                )
              }
            >
              <n.icon className="size-4" />
              <span className="flex-1">{n.label}</span>
              {n.badge === 'payments' && !!pending.data && (
                <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white">{pending.data}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-stone-100 p-4">
          <div className="flex items-center gap-2">
            <span
              className={cx('size-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-stone-300')}
              title={connected ? 'Real-time ulangan' : 'Ulanmagan'}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{me.fullName ?? me.phone}</p>
              <p className="text-xs text-stone-500">{ROLE[me.role]}</p>
            </div>
            <button onClick={() => void logout()} className="rounded-md p-1.5 text-stone-500 hover:bg-stone-100" title="Chiqish">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
