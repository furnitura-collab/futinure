import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Menu, Search } from '@/components/icons';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useI18n } from '@/i18n';
import { useRealtime } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ProfileMenu } from '../ProfileMenu';
import { ThemeToggle } from '../ThemeToggle';
import { Brand, NavList } from './Sidebar';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

function RealtimeDot() {
  const { t } = useI18n();
  const { connected } = useRealtime();
  const text = connected ? t('nav.online') : t('nav.offline');
  return (
    <span role="status" title={text} aria-label={text} className="relative mx-2 flex size-2">
      {connected && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-40" />}
      <span className={cn('relative size-2 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/40')} />
    </span>
  );
}

/** Qidiruv maydoniga o'xshash tugma — buyruqlar panelini ochadi */
function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="hidden h-9 w-full max-w-sm items-center gap-2.5 rounded-lg border border-input bg-background/60 px-3 text-sm text-muted-foreground transition-colors outline-none hover:border-primary/30 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">{t('palette.placeholder')}</span>
        <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px] leading-5">{MAC ? '⌘K' : 'Ctrl K'}</kbd>
      </button>
      <IconButton icon={Search} label={t('palette.open')} size="icon" className="sm:hidden" onClick={onOpen} />
    </>
  );
}

export function Topbar({ onSearch }: { onSearch: () => void }) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="glass sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-3 sm:px-5 lg:px-6">
      <IconButton icon={Menu} label={t('common.menu')} size="icon" className="lg:hidden" onClick={() => setMenuOpen(true)} />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-64 gap-0 p-0">
          <SheetTitle className="flex h-14 items-center px-4">
            <Brand />
          </SheetTitle>
          <div className="px-2.5 py-2">
            <NavList onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <SearchTrigger onOpen={onSearch} />
      <div className="ml-auto flex items-center gap-0.5">
        <RealtimeDot />
        <LanguageSwitcher />
        <ThemeToggle />
        <ProfileMenu />
      </div>
    </header>
  );
}
