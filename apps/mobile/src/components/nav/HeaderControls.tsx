import { useState } from 'react';
import { View } from 'react-native';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Flag, IconButton, PressableScale, Sheet } from '@/components/ui';
import { LANGUAGES, useI18n } from '@/i18n';
import { radius, space, useTheme, useThemeSettings } from '@/theme';

/**
 * Ilova sarlavhasidagi til va mavzu tugmalari (faqat ikonka).
 * Til — joriy bayroq → pastdan panelda bayroqlar; mavzu — bir bosishda yorug' ↔ qorong'i
 * (ikonka qaysi mavzuga o'tishini ko'rsatadi). "Tizim bo'yicha" — profil sozlamalarida.
 */
export function HeaderControls() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
      <LanguageButton />
      <ThemeButton />
    </View>
  );
}

function LanguageButton() {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PressableScale
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${t('language')}: ${LANGUAGES.find((l) => l.value === locale)?.label}`}
        scale={0.95}
        hoverStyle={{ backgroundColor: colors.muted }}
        style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.full }}
      >
        <Flag locale={locale} />
      </PressableScale>
      <Sheet open={open} onClose={() => setOpen(false)} title={t('language')}>
        <View style={{ alignItems: 'center', paddingVertical: space(2) }}>
          <LanguageSwitch onChange={() => setOpen(false)} />
        </View>
      </Sheet>
    </>
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
      size={40}
      onPress={() => setPreference(dark ? 'light' : 'dark')}
    />
  );
}
