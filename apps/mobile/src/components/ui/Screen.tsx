import { router, useFocusEffect } from 'expo-router';
import { use, useCallback, useState, type ComponentRef, type ReactElement, type ReactNode, type Ref } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View, type NativeScrollEvent, type StyleProp, type ViewStyle } from 'react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { BottomTabBarHeightContext } from 'expo-router/build/react-navigation/bottom-tabs/utils/BottomTabBarHeightContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageHeader, type Crumb } from '@/components/web/PageHeader';
import { SiteFooter } from '@/components/web/SiteFooter';
import { TwoColumn } from '@/components/web/TwoColumn';
import { useI18n } from '@/i18n';
import { contained, CONTENT, useSite } from '@/lib/layout';
import { space, useTheme } from '@/theme';
import { Background } from './Background';
import { Card } from './Card';
import { GlassView } from './GlassView';
import { Sheet } from './Sheet';

export interface ScreenInsets {
  /** Shaffof sarlavha (yoki status bar) balandligi */
  top: number;
  /** Tab bar / pastki panel / safe area balandligi */
  bottom: number;
  /** Ro'yxat konteyneri: markazda va yon bo'shliq bilan (saytda — sarlavha chizig'ida) */
  container: ViewStyle;
  /** Saytda ro'yxat boshi (sahifa sarlavhasi); telefonda yo'q */
  header?: ReactElement;
  /** Saytda ro'yxat oxiri (sayt pastki qismi); telefonda yo'q */
  footer?: ReactElement;
}

interface ScreenProps {
  children: ReactNode | ((insets: ScreenInsets) => ReactNode);
  /** false — ichida o'z FlatList'i bor (children funksiya bo'lib insets oladi) */
  scroll?: boolean;
  width?: keyof typeof CONTENT;
  /** Saytdagi kenglik: ko'p sahifa to'liq konteynerda, oddiy ro'yxatlar — markazdagi ustunda */
  siteWidth?: keyof typeof CONTENT;
  /** Pastda yopishgan shisha panel (jami summa, asosiy tugma); saytda — yon ustunda yoki kontent ostida */
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  /** Ekran ichidagi bo'limga aylantirish uchun (masalan, "Taklifni ko'rish") */
  scrollRef?: Ref<ComponentRef<typeof ScrollView>>;
  /** Sahifa nomi: brauzer tabida "… · Mebel Order", saytda — H1 */
  title?: string;
  /** Saytda sarlavha ustidagi yo'l */
  crumbs?: Crumb[];
  /** Saytda sarlavha o'ngidagi boshqaruvlar */
  actions?: ReactNode;
  /** false — saytda H1 sahifaning o'zida chiziladi */
  heading?: boolean;
  /** Saytda o'ngdagi yopishgan ustun (xulosa, holat); footer ham shu ustunga tushadi */
  aside?: ReactNode;
  /** Modal marshrut: saytda markazdagi oyna bo'lib ochiladi */
  modal?: boolean;
  /** Saytda sahifa oxiriga yaqinlashganda (keyingi sahifani yuklash) */
  onEndReached?: () => void;
}

const nearEnd = ({ layoutMeasurement: l, contentOffset: o, contentSize: c }: NativeScrollEvent) => l.height + o.y >= c.height - l.height / 2;

/**
 * Har ekranning asosi: tekis fon, shaffof sarlavha va tab bar ostidan to'g'ri bo'shliq,
 * keng ekranda kontent markazda (contained). Saytda (WebShell ichida) — sahifa sarlavhasi,
 * ikki ustun va pastki qism; telefon ko'rinishi o'zgarmaydi.
 */
export function Screen(props: ScreenProps) {
  const { site } = useSite();
  const { t } = useI18n();
  const { title } = props;

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') document.title = title ? `${title} · ${t('appName')}` : t('appName');
    }, [title, t]),
  );

  return site ? <SiteScreen {...props} /> : <PhoneScreen {...props} />;
}

function PhoneScreen({ children, scroll = true, width = 'page', footer, refreshing, onRefresh, contentStyle, scrollRef }: ScreenProps) {
  const { colors } = useTheme();
  const safe = useSafeAreaInsets();
  const header = use(HeaderHeightContext) ?? 0;
  const tabBar = use(BottomTabBarHeightContext) ?? 0;
  const [footerHeight, setFooterHeight] = useState(0);

  const insets: ScreenInsets = {
    top: header || safe.top,
    bottom: (footer ? footerHeight : 0) + (tabBar || (footer ? 0 : safe.bottom)),
    container: { ...contained(CONTENT.page), paddingHorizontal: space(4) },
  };

  const body =
    typeof children === 'function' ? (
      children(insets)
    ) : scroll ? (
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          contained(CONTENT[width]),
          { paddingHorizontal: space(4), paddingTop: insets.top + space(4), paddingBottom: insets.bottom + space(6), gap: space(4) },
          contentStyle,
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} progressViewOffset={insets.top} />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    ) : (
      <View style={[{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }, contentStyle]}>{children}</View>
    );

  return (
    <View style={{ flex: 1 }}>
      <Background />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
        {footer ? (
          <GlassView
            bordered={false}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: tabBar,
              borderTopWidth: 1,
              borderTopColor: colors.glassBorder,
              paddingTop: space(3),
              paddingHorizontal: space(4),
              paddingBottom: tabBar ? space(3) : Math.max(safe.bottom, space(3)),
            }}
          >
            <View onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height + space(3) + (tabBar ? space(3) : Math.max(safe.bottom, space(3))))} style={[contained(CONTENT[width]), { gap: space(3) }]}>
              {footer}
            </View>
          </GlassView>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

function SiteScreen({ children, siteWidth = 'wide', footer, contentStyle, scrollRef, title, crumbs, actions, heading, aside, modal, onEndReached }: ScreenProps) {
  const { gutter } = useSite();
  const container: ViewStyle = { ...contained(CONTENT[siteWidth]), paddingHorizontal: gutter };
  const header = title ? <PageHeader title={title} crumbs={crumbs} actions={actions} heading={heading} /> : undefined;
  const insets: ScreenInsets = { top: 0, bottom: 0, container, header, footer: <SiteFooter /> };
  const content = typeof children === 'function' ? children(insets) : children;

  // Oldingi sahifa ortda ko'rinib turadi (transparentModal), ustida — markazdagi oyna
  if (modal) {
    return (
      <Sheet open onClose={close} title={title ?? ''} footer={footer}>
        {content}
      </Sheet>
    );
  }

  if (typeof children === 'function') {
    return (
      <View style={{ flex: 1 }}>
        <Background />
        {content}
        {footer ? <View style={[container, { paddingVertical: space(3), gap: space(3) }]}>{footer}</View> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Background />
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        onScroll={onEndReached ? (e) => nearEnd(e.nativeEvent) && onEndReached() : undefined}
        scrollEventThrottle={200}
        contentContainerStyle={[container, { flexGrow: 1, paddingTop: space(6) }]}
      >
        {header}
        <View style={{ flexGrow: 1 }}>
          {aside ? (
            <TwoColumn mainStyle={contentStyle} aside={<>{aside}{footer ? <Card style={{ gap: space(3) }}>{footer}</Card> : null}</>}>
              {content}
            </TwoColumn>
          ) : (
            <View style={[{ gap: space(4) }, contentStyle]}>
              {content}
              {footer}
            </View>
          )}
        </View>
        <SiteFooter />
      </ScrollView>
    </View>
  );
}
