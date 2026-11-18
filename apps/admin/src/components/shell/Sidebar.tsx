import { NavLink, useMatch } from 'react-router';
import { Hint, IconButton } from '@/components/IconButton';
import { SidebarToggle } from '@/components/icons';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { usePendingPayments } from '@/lib/hooks';
import { prefetchPage } from '@/lib/pages';
import { cn } from '@/lib/utils';
import { NAV, type NavItem as NavItemDef } from '../nav';

export function Brand({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8 shrink-0 rounded-lg" />
      {!compact && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">Mebel Order</p>
          <p className="truncate text-[11px] text-muted-foreground">{t('nav.panel')}</p>
        </div>
      )}
    </div>
  );
}

const ITEM =
  'group/nav relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';
const ACTIVE =
  'bg-primary/10 text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary';

function NavItem({ item: n, count, collapsed, onNavigate }: { item: NavItemDef; count?: number; collapsed?: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  // Faollik oldindan hisoblanadi: tooltip Slot'i NavLink'ning funksiya className'ini satrga aylantirib yuboradi
  const active = !!useMatch({ path: n.to, end: false });
  const warm = () => prefetchPage(n.page);
  const link = (
    <NavLink
      to={n.to}
      onClick={onNavigate}
      onMouseEnter={warm}
      onFocus={warm}
      aria-label={collapsed ? t(n.label) : undefined}
      className={cn(ITEM, active ? ACTIVE : 'text-muted-foreground hover:bg-accent/70 hover:text-foreground', collapsed && 'justify-center px-0')}
    >
      <n.icon className="size-5 shrink-0 transition-transform duration-150 group-hover/nav:scale-105" weight={active ? 'duotone' : 'regular'} />
      {!collapsed && <span className="flex-1 truncate">{t(n.label)}</span>}
      {!!count &&
        (collapsed ? (
          <span className="absolute top-1.5 right-2.5 size-2 rounded-full bg-primary ring-2 ring-background" />
        ) : (
          <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] leading-5 font-semibold text-primary-foreground tabular">
            {count}
          </span>
        ))}
    </NavLink>
  );
  return collapsed ? (
    <Hint label={t(n.label)} side="right">
      {link}
    </Hint>
  ) : (
    link
  );
}

export function NavList({ collapsed, onNavigate, items }: { collapsed?: boolean; onNavigate?: () => void; items?: NavItemDef[] }) {
  const { me, can } = useAuth();
  const pending = usePendingPayments(can('payments.manage'));
  if (!me) return null;

  return (
    <nav className="flex flex-col gap-0.5">
      {(items ?? NAV.filter((n) => can(n.permission))).map((n) => (
        <NavItem
          key={n.to}
          item={n}
          count={n.badge === 'payments' ? pending.data : undefined}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { t } = useI18n();
  return (
    <aside
      className={cn(
        'glass fixed inset-y-0 left-0 z-30 hidden flex-col border-r transition-[width] duration-200 ease-out lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      {/* Yig'ish tugmasi yuqorida: kengaygan — brend yonida; yig'ilgan — logotip ustiga kelganda (yoki fokusda) uning o'rnida */}
      <div className={cn('group relative flex h-14 shrink-0 items-center', collapsed ? 'justify-center' : 'justify-between pr-2.5 pl-4')}>
        <div className={cn(collapsed && 'transition-opacity group-focus-within:opacity-0 group-hover:opacity-0')}>
          <Brand compact={collapsed} />
        </div>
        <IconButton
          icon={SidebarToggle}
          label={collapsed ? t('common.expand') : t('common.collapse')}
          side="right"
          className={cn(
            'text-muted-foreground',
            collapsed && 'absolute inset-0 m-auto opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100',
          )}
          onClick={onToggle}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-2.5 py-2">
        <NavList collapsed={collapsed} />
      </div>
    </aside>
  );
}
