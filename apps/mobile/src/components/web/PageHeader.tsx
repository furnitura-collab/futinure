import { router, type Href } from 'expo-router';
import { Fragment, type ReactNode } from 'react';
import { View } from 'react-native';
// ui/index emas: Screen shu faylni import qiladi — aylana bog'liqlik bo'lmasin
import { Icon } from '@/components/ui/Icon';
import { PressableScale } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { radius, space, useTheme } from '@/theme';

export interface Crumb {
  label: string;
  href: Href;
}

interface PageHeaderProps {
  title: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
  /** false — H1 sahifaning o'zida (masalan, mahsulot xarid blokida), bu yerda faqat yo'l */
  heading?: boolean;
}

/** Saytdagi sahifa boshi: yo'l (Katalog › Kromka › …), H1 va o'ngda harakatlar */
export function PageHeader({ title, crumbs, actions, heading = true }: PageHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: space(4), marginBottom: space(6) }}>
      <View style={{ flexShrink: 1, gap: space(1) }}>
        {crumbs?.length ? (
          <View accessibilityRole="navigation" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space(1) }}>
            {crumbs.map((c) => (
              <Fragment key={c.label}>
                <PressableScale
                  onPress={() => router.navigate(c.href)}
                  accessibilityRole="link"
                  scale={0.98}
                  hoverStyle={{ backgroundColor: colors.muted }}
                  style={{ paddingHorizontal: space(1), paddingVertical: 2, borderRadius: radius.sm, marginHorizontal: -space(1) }}
                >
                  <Text v="small" muted>{c.label}</Text>
                </PressableScale>
                <Icon name="chevron-forward" size={12} muted />
              </Fragment>
            ))}
            <Text v="small" numberOfLines={1} style={{ flexShrink: 1 }}>{title}</Text>
          </View>
        ) : null}
        {heading && (
          <Text v="display" accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
        )}
      </View>
      {actions ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>{actions}</View> : null}
    </View>
  );
}
