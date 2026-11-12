import { View } from 'react-native';
import { LanguageMenu } from '@/components/LanguageMenu';
import { IconButton } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useTheme, useThemeSettings } from '@/theme';

/** Ilova sarlavhasidagi ixcham tugmalar o'lchami (til, mavzu, bildirishnoma — bir xil) */
export const HEADER_BUTTON = 32;

/**
 * Ilova sarlavhasidagi til va mavzu tugmalari (faqat ikonka).
 * Til — joriy bayroq → ostida select kabi bayroqlar ro'yxati; mavzu — bir bosishda yorug' ↔ qorong'i
 * (ikonka qaysi mavzuga o'tishini ko'rsatadi). "Tizim bo'yicha" — profil sozlamalarida.
 */
export function HeaderControls() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <LanguageMenu compact />
      <ThemeButton />
    </View>
  );
}

function ThemeButton() {
  const { t } = useI18n();
  const { scheme } = useTheme();
  const { setPreference } = useThemeSettings();
  const dark = scheme === 'dark';
  return (
    <IconButton
      icon={dark ? 'sunny-outline' : 'moon-outline'}
      label={dark ? t('themeLight') : t('themeDark')}
      size={HEADER_BUTTON}
      onPress={() => setPreference(dark ? 'light' : 'dark')}
    />
  );
}
