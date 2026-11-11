import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { flagUri } from '@mebel/shared';
import { LANGUAGES, useI18n } from '@/i18n';
import { radius, space, useTheme } from '@/theme';

/** Til tanlash — faqat bayroqlar; til nomi ekran o'quvchi uchun (accessibilityLabel) */
export function LanguageSwitch() {
  const { t, locale, setLocale } = useI18n();
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={t('language')} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
      {LANGUAGES.map((l) => {
        const active = l.value === locale;
        return (
          <Pressable
            key={l.value}
            onPress={() => setLocale(l.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={l.label}
            hitSlop={4}
            style={({ hovered }) => ({
              padding: 3,
              borderRadius: radius.sm,
              borderWidth: 2,
              borderColor: active ? colors.primary : 'transparent',
              opacity: active || hovered ? 1 : 0.55,
            })}
          >
            <Image source={{ uri: flagUri(l.value) }} style={{ width: 24, height: 16, borderRadius: 2 }} contentFit="cover" />
          </Pressable>
        );
      })}
    </View>
  );
}
