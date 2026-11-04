import { Languages } from 'lucide-react';
import { LOCALES, type Locale } from '@mebel/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LOCALE_NAMES, useI18n } from '@/i18n';

export function LanguageRadioItems() {
  const { locale, setLocale } = useI18n();
  return (
    <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      {LOCALES.map((l) => (
        <DropdownMenuRadioItem key={l} value={l} lang={l}>
          <span className="w-6 text-xs font-semibold text-muted-foreground uppercase">{l}</span>
          {LOCALE_NAMES[l]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function LanguageSwitcher() {
  const { t, locale } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('language.title')} title={t('language.title')} className="gap-1.5 px-2.5">
          <Languages />
          <span className="text-xs font-semibold uppercase">{locale}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t('language.title')}</DropdownMenuLabel>
        <LanguageRadioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
