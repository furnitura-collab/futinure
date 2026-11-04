import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui';
import { space, useTheme } from '@/theme';

/** Raqamlangan bo'lim: 1 Yetkazish usuli, 2 Manzil … — foydalanuvchi qayerdaligini biladi */
export function CheckoutSection({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text v="small" bold color={colors.primaryForeground}>{n}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text v="h2">{title}</Text>
          {hint ? <Text v="caption">{hint}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}
