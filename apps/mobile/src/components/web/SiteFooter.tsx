import { View } from 'react-native';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { LogoMark } from '@/components/LogoMark';
import { ThemeSwitch } from '@/components/ThemeSwitch';
import { Text } from '@/components/ui/Text';
import { useI18n } from '@/i18n';
import { space, useTheme } from '@/theme';

/** Sayt sahifalari oxiridagi ixcham qism: brend, til va mavzu (profilga kirmasdan), mualliflik */
export function SiteFooter() {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="contentinfo"
      style={{
        marginTop: space(10),
        paddingVertical: space(6),
        borderTopWidth: 1,
        borderTopColor: colors.border,
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: space(4),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), flexShrink: 1, maxWidth: 420 }}>
        <LogoMark size={32} />
        <View style={{ flexShrink: 1, gap: 2 }}>
          <Text bold>{t('appName')}</Text>
          <Text v="caption" numberOfLines={2}>{t('loginSubtitle')}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), flexWrap: 'wrap' }}>
        <View style={{ width: 168 }}>
          <LanguageSwitch short />
        </View>
        <View style={{ width: 264 }}>
          <ThemeSwitch />
        </View>
      </View>
      <Text v="caption">{t('copyright', { year: new Date().getFullYear() })}</Text>
    </View>
  );
}
