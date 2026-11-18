import { Command } from 'cmdk';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Spinner, Search } from '@/components/icons';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { prefetchPage } from '@/lib/pages';
import { useTheme } from '@/lib/theme';
import { NAV } from '../nav';
import { useCommandSearch, type SearchHit } from './useCommandSearch';

const ITEM =
  'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[selected=true]:bg-primary/10 data-[selected=true]:text-primary';

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="px-1.5 py-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
    >
      {children}
    </Command.Group>
  );
}

function Hit({ hit, onPick }: { hit: SearchHit; onPick: (to: string) => void }) {
  return (
    <Command.Item value={`${hit.to}`} onSelect={() => onPick(hit.to)} className={ITEM}>
      <span className="truncate font-medium">{hit.title}</span>
      {hit.meta && <span className="ml-auto truncate text-xs text-muted-foreground">{hit.meta}</span>}
    </Command.Item>
  );
}

/** ⌘K / Ctrl+K: bo'limlar, buyurtma/mijoz/mahsulot qidiruvi va tezkor amallar */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { resolved, setTheme } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { groups, loading } = useCommandSearch(q);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const go = (to: string) => run(() => navigate(to));
  const needle = q.trim().toLowerCase();
  const sections = NAV.filter((n) => can(n.permission) && t(n.label).toLowerCase().includes(needle));
  const actions = [
    can('catalog.edit') && { id: 'new-product', label: t('palette.newProduct'), run: () => go('/catalog/new') },
    { id: 'theme', label: t('palette.toggleTheme'), run: () => run(() => setTheme(resolved === 'dark' ? 'light' : 'dark')) },
  ].filter((a): a is { id: string; label: string; run: () => void } => !!a && a.label.toLowerCase().includes(needle));
  const hits = groups.orders.length + groups.customers.length + groups.products.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:top-[18%] sm:translate-y-0 sm:max-w-xl">
        <DialogTitle className="sr-only">{t('palette.open')}</DialogTitle>
        <Command shouldFilter={false} loop className="flex flex-col">
          <div className="flex items-center gap-2.5 border-b px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={q}
              onValueChange={setQ}
              placeholder={t('palette.placeholder')}
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && <Spinner className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <Command.List className="max-h-[min(60dvh,26rem)] overflow-y-auto py-1.5">
            <Command.Empty className="py-8 text-center text-sm text-muted-foreground">
              {loading ? t('palette.loading') : t('palette.empty')}
            </Command.Empty>
            {sections.length > 0 && (
              <Group heading={t('palette.sections')}>
                {sections.map((n) => (
                  <Command.Item key={n.to} value={n.to} onSelect={() => go(n.to)} onFocus={() => prefetchPage(n.page)} className={ITEM}>
                    <n.icon className="size-4 shrink-0 text-muted-foreground" />
                    {t(n.label)}
                  </Command.Item>
                ))}
              </Group>
            )}
            {hits > 0 &&
              (['orders', 'customers', 'products'] as const).map(
                (k) =>
                  groups[k].length > 0 && (
                    <Group key={k} heading={t(`palette.${k}`)}>
                      {groups[k].map((h) => (
                        <Hit key={h.id} hit={h} onPick={go} />
                      ))}
                    </Group>
                  ),
              )}
            {actions.length > 0 && (
              <Group heading={t('palette.actions')}>
                {actions.map((a) => (
                  <Command.Item key={a.id} value={a.id} onSelect={a.run} className={ITEM}>
                    {a.label}
                  </Command.Item>
                ))}
              </Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
