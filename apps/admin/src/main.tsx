import { lazy, StrictMode, Suspense, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShieldOff, SearchX } from 'lucide-react';
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import type { Role } from '@mebel/shared';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { MANAGERS } from '@/components/nav';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { I18nProvider, useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { LoginPage } from '@/pages/Login';
import './index.css';

/** Sahifalar alohida yuklanadi — birinchi ochilish tezroq */
function page<K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) {
  const Component: ComponentType = lazy(() => load().then((m) => ({ default: m[name] as ComponentType })));
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Component />
    </Suspense>
  );
}

function HomeLink() {
  const { t } = useI18n();
  return (
    <Button asChild variant="outline">
      <Link to="/orders">{t('common.toHome')}</Link>
    </Button>
  );
}

function NotFound() {
  const { t } = useI18n();
  return <EmptyState icon={SearchX} title={t('common.notFound')} description={t('common.notFoundHint')} action={<HomeLink />} />;
}

/** Rolga mos bo'lmasa — menyuda ham yo'q, to'g'ridan-to'g'ri havola bilan ham ochilmaydi */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { t } = useI18n();
  const { can } = useAuth();
  return can(...roles) ? children : <EmptyState icon={ShieldOff} title={t('common.forbidden')} description={t('common.forbiddenHint')} action={<HomeLink />} />;
}

const managers = (node: ReactNode) => <RequireRole roles={MANAGERS}>{node}</RequireRole>;

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

const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      element: <AppShell />,
      children: [
        { index: true, element: <Navigate to="/orders" replace /> },
        { path: 'orders', element: page(() => import('./pages/orders/OrdersPage'), 'OrdersPage') },
        { path: 'orders/:id', element: page(() => import('./pages/orders/OrderDetailPage'), 'OrderDetailPage') },
        { path: 'payments', element: managers(page(() => import('./pages/payments/PaymentsPage'), 'PaymentsPage')) },
        { path: 'catalog', element: managers(page(() => import('./pages/catalog/CatalogPage'), 'CatalogPage')) },
        { path: 'catalog/categories', element: managers(page(() => import('./pages/catalog/CategoriesPage'), 'CategoriesPage')) },
        { path: 'catalog/:id', element: managers(page(() => import('./pages/catalog/ProductEditPage'), 'ProductEditPage')) },
        { path: 'stock', element: page(() => import('./pages/stock/StockPage'), 'StockPage') },
        { path: 'customers', element: managers(page(() => import('./pages/customers/CustomersPage'), 'CustomersPage')) },
        { path: 'customers/:id', element: managers(page(() => import('./pages/customers/CustomerDetailPage'), 'CustomerDetailPage')) },
        { path: 'reports/receivables', element: managers(page(() => import('./pages/reports/ReceivablesPage'), 'ReceivablesPage')) },
        {
          path: 'staff',
          element: <RequireRole roles={['SUPER_ADMIN']}>{page(() => import('./pages/staff/StaffPage'), 'StaffPage')}</RequireRole>,
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || undefined },
);

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="top-right" richColors closeButton toastOptions={{ className: 'backdrop-blur-xl' }} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <I18nProvider>
            <RealtimeProvider>
              <TooltipProvider delayDuration={300}>
                <RouterProvider router={router} />
                <ThemedToaster />
              </TooltipProvider>
            </RealtimeProvider>
          </I18nProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
