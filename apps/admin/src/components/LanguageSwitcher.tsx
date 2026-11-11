import { flagUri, LOCALES, type Locale } from '@mebel/shared';
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { LOCALE_NAMES, useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

function Flag({ locale, className }: { locale: Locale; className?: string }) {
  return <img src={flagUri(locale)} alt="" className={cn('h-4 w-6 shrink-0 rounded-[2px] object-cover ring-1 ring-black/10', className)} />;
}

/** Profil menyusida (tor ekranda sarlavhada joy yo'q) — bayroq va til nomi */
export function LanguageRadioItems() {
  const { locale, setLocale } = useI18n();
  return (
    <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      {LOCALES.map((l) => (
        <DropdownMenuRadioItem key={l} value={l} lang={l}>
          <Flag locale={l} />
          {LOCALE_NAMES[l]}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

/** Sarlavhadagi til tanlash: faqat bayroqlar, bir bosishda (ochiladigan menyusiz); nomi — tooltip va ekran o'quvchi uchun */
export function LanguageSwitcher() {
  const { t, locale, setLocale } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('language.title')} className="flex items-center gap-0.5">
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={LOCALE_NAMES[l]}
            title={LOCALE_NAMES[l]}
            lang={l}
            onClick={() => setLocale(l)}
            className={cn(
              'rounded-md p-1.5 transition outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active ? 'bg-accent' : 'opacity-50 hover:bg-accent/60 hover:opacity-100',
            )}
          >
            <Flag locale={l} />
          </button>
        );
      })}
    </div>
  );
}
