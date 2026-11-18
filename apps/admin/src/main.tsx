import { lazy, StrictMode, Suspense, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import type { Permission } from '@mebel/shared';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { ShieldOff, SearchX } from '@/components/icons';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { I18nProvider, useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { usePhone } from '@/lib/hooks';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { PAGES, type PageKey } from '@/lib/pages';
import { LoginPage } from '@/pages/Login';
import '@fontsource-variable/inter/index.css';
import './index.css';

/** Sahifalar alohida yuklanadi — birinchi ochilish tezroq */
function page(key: PageKey) {
  const Component: ComponentType = lazy(() => PAGES[key]().then((c) => ({ default: c })));
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

/** Ruxsat bo'lmasa — menyuda ham yo'q, to'g'ridan-to'g'ri havola bilan ham ochilmaydi */
function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const { t } = useI18n();
  const { can } = useAuth();
  return can(permission) ? children : <EmptyState icon={ShieldOff} title={t('common.forbidden')} description={t('common.forbiddenHint')} action={<HomeLink />} />;
}

const guard = (permission: Permission, node: ReactNode) => <RequirePermission permission={permission}>{node}</RequirePermission>;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
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
        { path: 'orders', element: guard('orders.view', page('orders')) },
        { path: 'orders/:id', element: guard('orders.view', page('order')) },
        { path: 'payments', element: guard('payments.manage', page('payments')) },
        { path: 'catalog', element: guard('catalog.edit', page('catalog')) },
        { path: 'catalog/categories', element: guard('catalog.edit', page('categories')) },
        { path: 'catalog/:id', element: guard('catalog.edit', page('product')) },
        { path: 'stock', element: guard('stock.manage', page('stock')) },
        { path: 'customers', element: guard('customers.manage', page('customers')) },
        { path: 'customers/:id', element: guard('customers.manage', page('customer')) },
        { path: 'reports/receivables', element: guard('customers.manage', page('receivables')) },
        { path: 'staff', element: guard('staff.manage', page('staff')) },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || undefined },
);

function ThemedToaster() {
  const { resolved } = useTheme();
  // Telefonda pastda tab bar va amallar paneli — xabar tepada chiqadi
  const phone = usePhone();
  return <Toaster theme={resolved} position={phone ? 'top-center' : 'bottom-right'} richColors closeButton toastOptions={{ className: 'backdrop-blur-xl' }} />;
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
