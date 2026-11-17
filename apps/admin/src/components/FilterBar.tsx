import { useState, type ReactNode } from 'react';
import { Filter } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetFooter, SheetTitle } from '@/components/ui/sheet';
import { useI18n } from '@/i18n';
import { usePhone } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { IconButton } from './IconButton';

export interface FilterGroup {
  id: string;
  /** Telefon varag'ida guruh nomi */
  label: string;
  /** Standart qiymatdan farqli — filtr tugmasidagi songa qo'shiladi */
  active: boolean;
  node: ReactNode;
}

// Varaqda segmentlar o'raladi, tanlovlar to'liq kenglikda
const IN_SHEET = '[&_[role=radiogroup]]:flex [&_[role=radiogroup]]:w-full [&_[role=radiogroup]]:flex-wrap [&_[role=combobox]]:w-full';

/**
 * Qidiruv + filtrlar. Kattaroq ekranda — bir qatorda (ota Toolbar ichida). Telefonda — qidiruv va filtr tugmasi
 * (faol filtrlar soni bilan), filtrlar pastdan chiqadigan varaqda: kontent uchun joy qoladi.
 */
export function FilterBar({ search, filters, onReset }: { search?: ReactNode; filters: FilterGroup[]; onReset?: () => void }) {
  const { t } = useI18n();
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const active = filters.filter((f) => f.active).length;

  if (!phone) {
    return (
      <>
        {search}
        {filters.map((f) => (
          <span key={f.id} className="contents">
            {f.node}
          </span>
        ))}
      </>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="min-w-0 flex-1 [&>*]:w-full">{search}</div>
      {filters.length > 0 && (
        <span className="relative shrink-0">
          <IconButton icon={Filter} label={t('common.filters')} variant={active ? 'secondary' : 'outline'} size="icon" onClick={() => setOpen(true)} />
          {active > 0 && (
            <span className="pointer-events-none absolute -top-1 -right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground tabular">
              {active}
            </span>
          )}
        </span>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 rounded-t-2xl p-0 pb-[var(--safe-bottom)]">
          <SheetTitle className="px-4 pt-4 pb-1 text-base">{t('common.filters')}</SheetTitle>
          <div className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3', IN_SHEET)}>
            {filters.map((f) => (
              <section key={f.id} className="space-y-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">{f.label}</h3>
                {f.node}
              </section>
            ))}
          </div>
          <SheetFooter className="flex-row gap-2 border-t p-3">
            {onReset && (
              <Button variant="outline" className="flex-1" disabled={!active} onClick={onReset}>
                {t('common.clear')}
              </Button>
            )}
            <Button className="flex-1" onClick={() => setOpen(false)}>
              {t('common.show')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
