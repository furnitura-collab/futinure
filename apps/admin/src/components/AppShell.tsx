import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useI18n } from '@/i18n';
import { PANEL_ROLES, useAuth } from '@/lib/auth';
import { usePendingPayments } from '@/lib/hooks';
import { useRealtime } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MANAGERS, NAV } from './nav';
import { PageSkeleton } from './PageSkeleton';
import { ProfileMenu } from './ProfileMenu';
import { ThemeToggle } from './ThemeToggle';

const COLLAPSE_KEY = 'mebel.admin.sidebar';

function Brand({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 shrink-0" />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">Mebel Order</p>
          <p className="truncate text-xs text-muted-foreground">{t('nav.panel')}</p>
        </div>
      )}
    </div>
  );
}

function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { me, can } = useAuth();
  const pending = usePendingPayments(can(...MANAGERS));
  if (!me) return null;

  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((n) => n.roles.includes(me.role)).map((n) => {
        const count = n.badge === 'payments' ? pending.data : undefined;
        const link = (
          <NavLink
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                isActive ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center px-0',
              )
            }
          >
            <n.icon className="size-[18px] shrink-0" />
            {!collapsed && <span className="flex-1 truncate">{t(n.label)}</span>}
            {!!count &&
              (collapsed ? (
                <span className="absolute top-1.5 right-2 size-2 rounded-full bg-primary ring-2 ring-background" />
              ) : (
                <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular">{count}</span>
              ))}
          </NavLink>
        );
        return collapsed ? (
          <Tooltip key={n.to}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{t(n.label)}</TooltipContent>
          </Tooltip>
        ) : (
          link
        );
      })}
    </nav>
  );
}

function RealtimeDot() {
  const { t } = useI18n();
  const { connected } = useRealtime();
  const text = connected ? t('nav.online') : t('nav.offline');
  return (
    <span role="status" title={text} aria-label={text} className="relative mx-1.5 flex size-2.5">
      {connected && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-40" />}
      <span className={cn('relative size-2.5 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/40')} />
    </span>
  );
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Panel karkasi: shisha yon panel (yig'iladi), yuqori panel, telefonda — chiqib keluvchi menyu */
export function AppShell() {
  const { t } = useI18n();
  const { me, loading } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <PageSkeleton cards={4} />
      </div>
    );
  }
  if (!me || !PANEL_ROLES.includes(me.role)) return <Navigate to="/login" replace />;

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // xususiy rejim
      }
      return !c;
    });
  };

  return (
    <div className="min-h-dvh">
      <aside
        className={cn(
          'glass fixed inset-y-0 left-0 z-30 hidden flex-col border-r transition-[width] duration-200 ease-out lg:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
        )}
      >
        <div className={cn('flex h-16 items-center', collapsed ? 'justify-center' : 'px-5')}>
          <Brand compact={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavList collapsed={collapsed} />
        </div>
        <div className={cn('border-t p-3', collapsed && 'flex justify-center')}>
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            onClick={toggle}
            aria-label={collapsed ? t('common.expand') : t('common.collapse')}
            title={collapsed ? t('common.expand') : t('common.collapse')}
            className={cn(!collapsed && 'w-full justify-start text-muted-foreground')}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            {!collapsed && t('common.collapse')}
          </Button>
        </div>
      </aside>

      <div className={cn('transition-[padding] duration-200 ease-out', collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64')}>
        <header className="glass sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t('common.menu')}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetTitle className="flex h-16 items-center px-5">
                <Brand />
              </SheetTitle>
              <div className="px-3 py-2">
                <NavList onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <RealtimeDot />
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <ThemeToggle />
            <ProfileMenu />
          </div>
        </header>
        <main key={pathname} className="mx-auto w-full max-w-[1600px] animate-fade-up px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
