import { Segmented } from '@/components/ui/Segmented';
import { LANGUAGES, useI18n } from '@/i18n';

/** 3 til: qisqa (UZ/RU/EN) — kirish ekranida, to'liq nom — sozlamalarda */
export function LanguageSwitch({ short }: { short?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <Segmented
      value={locale}
      onChange={setLocale}
      accessibilityLabel={t('language')}
      options={LANGUAGES.map((l) => ({ value: l.value, label: short ? l.short : l.label }))}
    />
  );
}
