import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { LogoMark } from '@/components/LogoMark';
import { PressableScale } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { useI18n, type I18nKey } from '@/i18n';
import { space, useTheme } from '@/theme';

interface FooterColumn {
  title: I18nKey;
  links: { href: Href; label: I18nKey; push?: boolean }[];
}

const COLUMNS: FooterColumn[] = [
  {
    title: 'footerForBuyers',
    links: [
      { href: '/catalog', label: 'tabCatalog' },
      { href: '/sku', label: 'quickSku', push: true },
      { href: '/orders', label: 'tabOrders' },
    ],
  },
  {
    title: 'account',
    links: [
      { href: '/profile', label: 'tabProfile' },
      { href: '/addresses', label: 'addresses', push: true },
      { href: '/balance', label: 'paymentsHistory', push: true },
    ],
  },
];

/**
 * Sayt pastki qismi: brend va havola ustunlari, ostida — mualliflik va til.
 * Mavzu (yorug'/qorong'i) profil sozlamalarida — pastki qism sozlamalar paneliga aylanmasin.
 */
export function SiteFooter() {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <View accessibilityRole="contentinfo" style={{ marginTop: space(12), borderTopWidth: 1, borderTopColor: colors.border }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space(10), paddingVertical: space(8) }}>
        <View style={{ flexGrow: 1, flexBasis: 280, maxWidth: 360, gap: space(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <LogoMark size={32} />
            <Text v="heading" bold>{t('appName')}</Text>
          </View>
          <Text v="small" muted>{t('loginSubtitle')}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(16) }}>
          {COLUMNS.map((col) => (
            <View key={col.title} accessibilityRole="navigation" accessibilityLabel={t(col.title)} style={{ minWidth: 160, gap: space(3) }}>
              <Text v="caption" bold style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{t(col.title)}</Text>
              {col.links.map((l) => (
                <FooterLink key={l.label} label={t(l.label)} onPress={() => (l.push ? router.push(l.href) : router.navigate(l.href))} />
              ))}
            </View>
          ))}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: space(3),
          paddingVertical: space(5),
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Text v="caption">{t('copyright', { year: new Date().getFullYear() })}</Text>
        <LanguageSwitch />
      </View>
    </View>
  );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale onPress={onPress} accessibilityRole="link" scale={1} hoverStyle={{ opacity: 0.7 }} style={{ alignSelf: 'flex-start' }}>
      <Text v="small" color={colors.foreground}>{label}</Text>
    </PressableScale>
  );
}
