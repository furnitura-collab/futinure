import { lazy, StrictMode, Suspense, type ComponentType, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router';
import { Toaster } from 'sonner';
import type { Role } from '@mebel/shared';
import { AppShell } from '@/components/AppShell';
import { EmptyState } from '@/components/EmptyState';
import { ShieldOff, SearchX } from '@/components/icons';
import { MANAGERS } from '@/components/nav';
import { PageSkeleton } from '@/components/PageSkeleton';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { I18nProvider, useI18n } from '@/i18n';
import { ApiError } from '@/lib/api';
import { AuthProvider, useAuth } from '@/lib/auth';
import { RealtimeProvider } from '@/lib/realtime';
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
        { path: 'orders', element: page('orders') },
        { path: 'orders/:id', element: page('order') },
        { path: 'payments', element: managers(page('payments')) },
        { path: 'catalog', element: managers(page('catalog')) },
        { path: 'catalog/categories', element: managers(page('categories')) },
        { path: 'catalog/:id', element: managers(page('product')) },
        { path: 'stock', element: page('stock') },
        { path: 'customers', element: managers(page('customers')) },
        { path: 'customers/:id', element: managers(page('customer')) },
        { path: 'reports/receivables', element: managers(page('receivables')) },
        {
          path: 'staff',
          element: <RequireRole roles={['SUPER_ADMIN']}>{page('staff')}</RequireRole>,
        },
        { path: '*', element: <NotFound /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || undefined },
);

function ThemedToaster() {
  const { resolved } = useTheme();
  return <Toaster theme={resolved} position="bottom-right" richColors closeButton toastOptions={{ className: 'backdrop-blur-xl' }} />;
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
