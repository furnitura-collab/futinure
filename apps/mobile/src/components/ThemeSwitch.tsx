import { Segmented } from '@/components/ui/Segmented';
import { useI18n } from '@/i18n';
import { useThemeSettings, type ThemePreference } from '@/theme';

/** Mavzu tanlovlari — sozlamalar ro'yxati va sayt pastki qismi bir xil tartibda */
export function useThemeOptions(): { value: ThemePreference; label: string }[] {
  const { t } = useI18n();
  return [
    { value: 'light', label: t('themeLight') },
    { value: 'dark', label: t('themeDark') },
    { value: 'system', label: t('themeSystem') },
  ];
}

export function ThemeSwitch() {
  const { t } = useI18n();
  const { preference, setPreference } = useThemeSettings();
  return <Segmented value={preference} onChange={setPreference} accessibilityLabel={t('theme')} options={useThemeOptions()} />;
}
