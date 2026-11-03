import { lazy, StrictMode, Suspense, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import type { Role } from '@mebel/shared';
import { ApiError } from './lib/api';
import { AuthProvider, useAuth } from './lib/auth';
import { RealtimeProvider } from './lib/realtime';
import { Layout } from './components/Layout';
import { PageLoader } from './components/ui';
import { LoginPage } from './pages/Login';
import './index.css';

/** Sahifalar alohida yuklanadi — birinchi ochilish tezroq */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  const Component: ComponentType = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

/** Rolga mos bo'lmasa — menyuda ham yo'q, to'g'ridan-to'g'ri havola bilan ham ochilmaydi */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { can } = useAuth();
  return can(...roles) ? children : <div className="p-8 text-stone-500">Bu sahifaga ruxsat yo'q</div>;
}

const MGR: Role[] = ['MANAGER', 'SUPER_ADMIN'];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // 4xx — qayta urinish foydasiz
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
});

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/orders" replace /> },
      { path: 'orders', element: page(() => import('./pages/orders/OrdersPage'), 'OrdersPage') },
      { path: 'orders/:id', element: page(() => import('./pages/orders/OrderDetailPage'), 'OrderDetailPage') },
      { path: 'payments', element: <RequireRole roles={MGR}>{page(() => import('./pages/payments/PaymentsPage'), 'PaymentsPage')}</RequireRole> },
      { path: 'catalog', element: <RequireRole roles={MGR}>{page(() => import('./pages/catalog/CatalogPage'), 'CatalogPage')}</RequireRole> },
      { path: 'catalog/categories', element: <RequireRole roles={MGR}>{page(() => import('./pages/catalog/CategoriesPage'), 'CategoriesPage')}</RequireRole> },
      { path: 'catalog/:id', element: <RequireRole roles={MGR}>{page(() => import('./pages/catalog/ProductEditPage'), 'ProductEditPage')}</RequireRole> },
      { path: 'stock', element: page(() => import('./pages/stock/StockPage'), 'StockPage') },
      { path: 'customers', element: <RequireRole roles={MGR}>{page(() => import('./pages/customers/CustomersPage'), 'CustomersPage')}</RequireRole> },
      { path: 'customers/:id', element: <RequireRole roles={MGR}>{page(() => import('./pages/customers/CustomerDetailPage'), 'CustomerDetailPage')}</RequireRole> },
      { path: 'reports/receivables', element: <RequireRole roles={MGR}>{page(() => import('./pages/reports/ReceivablesPage'), 'ReceivablesPage')}</RequireRole> },
      { path: '*', element: <div className="p-8 text-stone-500">Sahifa topilmadi</div> },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || undefined });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeProvider>
          <RouterProvider router={router} />
          <Toaster position="top-right" richColors closeButton />
        </RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
