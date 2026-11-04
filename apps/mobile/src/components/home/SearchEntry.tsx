import { router } from 'expo-router';
import { Icon, PressableScale, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { radius, space, useTheme } from '@/theme';

/** Katta qidiruv maydoni — bosilganda katalog qidiruvi fokus bilan ochiladi */
export function SearchEntry() {
  const { t } = useI18n();
  const { colors, shadow } = useTheme();
  return (
    <PressableScale
      onPress={() => router.navigate({ pathname: '/catalog', params: { focus: String(Date.now()) } })}
      scale={0.99}
      accessibilityRole="search"
      accessibilityLabel={t('searchPlaceholder')}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: space(3), height: 52, paddingHorizontal: space(4), borderRadius: radius.md, borderWidth: 1, borderColor: colors.input, backgroundColor: colors.card },
        shadow,
      ]}
    >
      <Icon name="search" size={20} muted />
      <Text muted style={{ flex: 1 }} numberOfLines={1}>{t('searchPlaceholder')}</Text>
    </PressableScale>
  );
}
