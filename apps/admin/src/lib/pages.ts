/** Sahifa chunk'lari: router shu yerdan yuklaydi, menyu hover'da oldindan chaqiradi (brauzer keshlaydi) */
export const PAGES = {
  orders: () => import('@/pages/orders/OrdersPage').then((m) => m.OrdersPage),
  order: () => import('@/pages/orders/detail/OrderDetailPage').then((m) => m.OrderDetailPage),
  payments: () => import('@/pages/payments/PaymentsPage').then((m) => m.PaymentsPage),
  catalog: () => import('@/pages/catalog/CatalogPage').then((m) => m.CatalogPage),
  categories: () => import('@/pages/catalog/CategoriesPage').then((m) => m.CategoriesPage),
  product: () => import('@/pages/catalog/ProductEditPage').then((m) => m.ProductEditPage),
  stock: () => import('@/pages/stock/StockPage').then((m) => m.StockPage),
  customers: () => import('@/pages/customers/CustomersPage').then((m) => m.CustomersPage),
  customer: () => import('@/pages/customers/CustomerDetailPage').then((m) => m.CustomerDetailPage),
  receivables: () => import('@/pages/reports/ReceivablesPage').then((m) => m.ReceivablesPage),
  staff: () => import('@/pages/staff/StaffPage').then((m) => m.StaffPage),
  roles: () => import('@/pages/staff/RolesPage').then((m) => m.RolesPage),
} as const;

export type PageKey = keyof typeof PAGES;

const warmed = new Set<PageKey>();

export function prefetchPage(key: PageKey) {
  if (warmed.has(key)) return;
  warmed.add(key);
  void PAGES[key]().catch(() => warmed.delete(key));
}
