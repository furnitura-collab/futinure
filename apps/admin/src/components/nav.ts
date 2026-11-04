import { ClipboardList, Package, TrendingDown, UserCog, Users, Wallet, Warehouse, type LucideIcon } from 'lucide-react';
import type { Role } from '@mebel/shared';
import type { TKey } from '@/i18n';

export const MANAGERS: Role[] = ['MANAGER', 'SUPER_ADMIN'];
const ALL_STAFF: Role[] = ['MANAGER', 'SUPER_ADMIN', 'WAREHOUSE'];

export interface NavItem {
  to: string;
  label: TKey;
  icon: LucideIcon;
  roles: Role[];
  badge?: 'payments';
}

export const NAV: NavItem[] = [
  { to: '/orders', label: 'nav.orders', icon: ClipboardList, roles: ALL_STAFF },
  { to: '/payments', label: 'nav.payments', icon: Wallet, roles: MANAGERS, badge: 'payments' },
  { to: '/catalog', label: 'nav.catalog', icon: Package, roles: MANAGERS },
  { to: '/stock', label: 'nav.stock', icon: Warehouse, roles: ALL_STAFF },
  { to: '/customers', label: 'nav.customers', icon: Users, roles: MANAGERS },
  { to: '/reports/receivables', label: 'nav.receivables', icon: TrendingDown, roles: MANAGERS },
  { to: '/staff', label: 'nav.staff', icon: UserCog, roles: ['SUPER_ADMIN'] },
];
