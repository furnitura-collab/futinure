import { useState } from 'react';
import { NavLink, useLocation, useMatch } from 'react-router';
import { DotsThree } from '@/components/icons';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { usePendingPayments } from '@/lib/hooks';
import { prefetchPage } from '@/lib/pages';
import { cn } from '@/lib/utils';
import { MANAGERS, NAV, type NavItem } from '../nav';
import { NavList } from './Sidebar';

/** Tab bar'da 5 joy: bo'limlar ko'p bo'lsa — 4 tasi va "Yana" */
const SLOTS = 5;

const TAB =
  'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[11px] font-medium transition-colors outline-none focus-visible:bg-accent';

function Badge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <span className="absolute top-1 left-1/2 ml-2 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground tabular">
      {count}
    </span>
  );
}

function Tab({ item: n, count }: { item: NavItem; count?: number }) {
  const { t } = useI18n();
  const active = !!useMatch({ path: n.to, end: false });
  return (
    <NavLink to={n.to} onTouchStart={() => prefetchPage(n.page)} className={cn(TAB, active ? 'text-primary' : 'text-muted-foreground')}>
      <n.icon className="size-6" weight={active ? 'duotone' : 'regular'} />
      <span className="max-w-full truncate px-1">{t(n.label)}</span>
      <Badge count={count} />
    </NavLink>
  );
}

/** Telefon va planshetda (< lg): pastki tab bar — CLAUDE.md qoidasi; matn kiritilayotganda (klaviatura ochiq) yashirinadi */
export function BottomNav() {
  const { t } = useI18n();
  const { me, can } = useAuth();
  const { pathname } = useLocation();
  const pending = usePendingPayments(can(...MANAGERS));
  const [more, setMore] = useState(false);
  if (!me) return null;

  const items = NAV.filter((n) => n.roles.includes(me.role));
  const overflow = items.length > SLOTS;
  const tabs = overflow ? items.slice(0, SLOTS - 1) : items;
  const rest = overflow ? items.slice(SLOTS - 1) : [];
  const restActive = rest.some((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  const countOf = (n: NavItem) => (n.badge === 'payments' ? pending.data : undefined);

  return (
    <>
      <nav className="glass fixed inset-x-0 bottom-0 z-30 flex [body:has(:is(input:not([type=checkbox],[type=radio]),textarea):focus)_&]:hidden h-[calc(3.75rem+env(safe-area-inset-bottom))] border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
        {tabs.map((n) => (
          <Tab key={n.to} item={n} count={countOf(n)} />
        ))}
        {overflow && (
          <button type="button" onClick={() => setMore(true)} className={cn(TAB, restActive ? 'text-primary' : 'text-muted-foreground')}>
            <DotsThree className="size-6" weight={restActive ? 'bold' : 'regular'} />
            <span>{t('nav.more')}</span>
            <Badge count={rest.reduce((s, n) => s + (countOf(n) ?? 0), 0)} />
          </button>
        )}
      </nav>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]">
          <SheetTitle className="px-5 pt-4 pb-2 text-sm text-muted-foreground">{t('nav.more')}</SheetTitle>
          <div className="px-2.5 pb-3">
            <NavList items={rest} onNavigate={() => setMore(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
