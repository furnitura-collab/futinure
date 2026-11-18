import type { Permission } from '@mebel/shared';
import { ClipboardText, Cube, IdentificationBadge, Invoice, UsersThree, Wallet, Warehouse, type IconType } from '@/components/icons';
import type { TKey } from '@/i18n';
import type { PageKey } from '@/lib/pages';


export interface NavItem {
  to: string;
  label: TKey;
  icon: IconType;
  page: PageKey;
  /** Ko'rinadi va ochiladi — shu ruxsat bilan */
  permission: Permission;
  badge?: 'payments';
}

export const NAV: NavItem[] = [
  { to: '/orders', page: 'orders', label: 'nav.orders', icon: ClipboardText, permission: 'orders.view' },
  { to: '/payments', page: 'payments', label: 'nav.payments', icon: Wallet, permission: 'payments.manage', badge: 'payments' },
  { to: '/catalog', page: 'catalog', label: 'nav.catalog', icon: Cube, permission: 'catalog.edit' },
  { to: '/stock', page: 'stock', label: 'nav.stock', icon: Warehouse, permission: 'stock.manage' },
  { to: '/customers', page: 'customers', label: 'nav.customers', icon: UsersThree, permission: 'customers.manage' },
  { to: '/reports/receivables', page: 'receivables', label: 'nav.receivables', icon: Invoice, permission: 'customers.manage' },
  { to: '/staff', page: 'staff', label: 'nav.staff', icon: IdentificationBadge, permission: 'staff.manage' },
];
