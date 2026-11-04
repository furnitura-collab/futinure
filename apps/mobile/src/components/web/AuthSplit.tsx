import { useEffect, type ReactNode } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { LogoMark } from '@/components/LogoMark';
import { Background, Icon, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useLayout } from '@/lib/layout';
import { font, space, useTheme } from '@/theme';
import { useWebFocusRing } from './useWebFocusRing';

/** Kirish va tanishuv ekrani kompyuter brauzerida ikkiga bo'linadimi */
export function useAuthSplit() {
  const { wide } = useLayout();
  return Platform.OS === 'web' && wide;
}

/** Brend, qisqa tavsif va afzalliklar — telefonda markazda, saytda rangli panelda (onBrand) */
export function BrandIntro({ onBrand }: { onBrand?: boolean }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const fg = onBrand ? colors.primaryForeground : undefined;
  return (
    <View style={{ alignItems: onBrand ? 'flex-start' : 'center', gap: onBrand ? space(6) : space(3) }}>
      <LogoMark size={72} raised={!onBrand} inverse={onBrand} />
      <View style={{ alignItems: onBrand ? 'flex-start' : 'center', gap: space(1) }}>
        <Text v={onBrand ? 'display' : 'title'} color={fg}>{t('appName')}</Text>
        <Text muted={!onBrand} color={fg} center={!onBrand} style={onBrand && { fontSize: font.lg, lineHeight: 24, opacity: 0.9 }}>
          {t('loginSubtitle')}
        </Text>
      </View>
      <View style={{ gap: space(onBrand ? 3 : 2), alignSelf: 'stretch', paddingHorizontal: onBrand ? 0 : space(2) }}>
        {(['loginBenefit1', 'loginBenefit2', 'loginBenefit3'] as const).map((k) => (
          <Row key={k} gap={space(2)}>
            <Icon name="checkmark-circle" size={18} tone={onBrand ? undefined : 'success'} color={fg} />
            <Text v={onBrand ? 'body' : 'small'} color={fg} style={{ flex: 1 }}>{t(k)}</Text>
          </Row>
        ))}
      </View>
    </View>
  );
}

/** Saytdagi kirish: chapda brend paneli (iliq gradient), o'ngda — forma */
export function AuthSplit({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const { desktop } = useLayout();
  useWebFocusRing();
  useEffect(() => {
    document.title = `${title} · ${t('appName')}`;
  }, [title, t]);
  return (
    <View style={{ flex: 1, flexDirection: 'row' }}>
      <View
        style={{
          flex: desktop ? 1 : 0.9,
          justifyContent: 'center',
          padding: space(desktop ? 16 : 10),
          backgroundImage: `linear-gradient(140deg, ${colors.primary} 0%, ${colors.accentForeground} 100%)`,
          backgroundColor: colors.primary,
        }}
      >
        <View style={{ maxWidth: 460 }}>
          <BrandIntro onBrand />
        </View>
      </View>
      <View style={{ flex: 1 }}>
        <Background />
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space(desktop ? 12 : 8) }} keyboardShouldPersistTaps="handled">
          <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', gap: space(6) }}>{children}</View>
        </ScrollView>
      </View>
    </View>
  );
}
