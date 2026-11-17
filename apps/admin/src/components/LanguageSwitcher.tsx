import { flagUri, LOCALES, type Locale } from '@mebel/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALE_NAMES, useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { Hint } from './IconButton';

function Flag({ locale, className }: { locale: Locale; className?: string }) {
  return <img src={flagUri(locale)} alt="" className={cn('h-4 w-6 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10', className)} />;
}

/** Sarlavhadagi til tanlash: bitta tugma (joriy til bayrog'i) → popup ichida faqat bayroqlar; nomi — tooltip va ekran o'quvchi uchun */
export function LanguageSwitcher() {
  const { t, locale, setLocale } = useI18n();
  const title = `${t('language.title')}: ${LOCALE_NAMES[locale]}`;
  return (
    <DropdownMenu>
      <Hint label={title} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={title}>
            <Flag locale={locale} className="h-3.5 w-5" />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="min-w-0">
        <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
          {LOCALES.map((l) => (
            <DropdownMenuRadioItem key={l} value={l} lang={l} aria-label={LOCALE_NAMES[l]} title={LOCALE_NAMES[l]}>
              <Flag locale={l} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
