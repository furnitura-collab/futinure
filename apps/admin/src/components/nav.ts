import type { Role } from '@mebel/shared';
import { ClipboardText, Cube, IdentificationBadge, Invoice, UsersThree, Wallet, Warehouse, type IconType } from '@/components/icons';
import type { TKey } from '@/i18n';
import type { PageKey } from '@/lib/pages';

export const MANAGERS: Role[] = ['MANAGER', 'SUPER_ADMIN'];
const ALL_STAFF: Role[] = ['MANAGER', 'SUPER_ADMIN', 'WAREHOUSE'];

export interface NavItem {
  to: string;
  label: TKey;
  icon: IconType;
  page: PageKey;
  roles: Role[];
  badge?: 'payments';
}

export const NAV: NavItem[] = [
  { to: '/orders', page: 'orders', label: 'nav.orders', icon: ClipboardText, roles: ALL_STAFF },
  { to: '/payments', page: 'payments', label: 'nav.payments', icon: Wallet, roles: MANAGERS, badge: 'payments' },
  { to: '/catalog', page: 'catalog', label: 'nav.catalog', icon: Cube, roles: MANAGERS },
  { to: '/stock', page: 'stock', label: 'nav.stock', icon: Warehouse, roles: ALL_STAFF },
  { to: '/customers', page: 'customers', label: 'nav.customers', icon: UsersThree, roles: MANAGERS },
  { to: '/reports/receivables', page: 'receivables', label: 'nav.receivables', icon: Invoice, roles: MANAGERS },
  { to: '/staff', page: 'staff', label: 'nav.staff', icon: IdentificationBadge, roles: ['SUPER_ADMIN'] },
];
