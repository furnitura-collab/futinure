import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { PANEL_ROLES, useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command/CommandPalette';
import { PageSkeleton } from './PageSkeleton';
import { BottomNav } from './shell/BottomNav';
import { Sidebar } from './shell/Sidebar';
import { Topbar } from './shell/Topbar';

const COLLAPSE_KEY = 'mebel.admin.sidebar';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(v: boolean) {
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  } catch {
    // xususiy rejim: holat faqat shu sessiyada
  }
}

/** Panel karkasi: shisha yon panel (yig'iladi), yuqori panel, ⌘K buyruqlar paneli */
export function AppShell() {
  const { me, loading } = useAuth();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [searching, setSearching] = useState(false);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <PageSkeleton cards={4} />
      </div>
    );
  }
  if (!me || !PANEL_ROLES.includes(me.role)) return <Navigate to="/login" replace />;

  const toggle = () => {
    saveCollapsed(!collapsed);
    setCollapsed(!collapsed);
  };

  return (
    <div className="min-h-dvh">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className={cn('transition-[padding] duration-200 ease-out', collapsed ? 'lg:pl-16' : 'lg:pl-60')}>
        <Topbar onSearch={() => setSearching(true)} />
        <main key={pathname} className="mx-auto w-full max-w-[1600px] animate-fade-up px-3 pt-3 pb-[calc(var(--tabbar)+1rem+var(--safe-bottom))] sm:pt-4 sm:px-5 lg:px-6 lg:pb-4">
          <Outlet />
        </main>
      </div>
      <BottomNav />
      <CommandPalette open={searching} onOpenChange={setSearching} />
    </div>
  );
}
