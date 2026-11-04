import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SiteContext } from '@/lib/layout';
import { useTheme } from '@/theme';
import { useWebFocusRing } from './useWebFocusRing';
import { WebHeader } from './WebHeader';

/**
 * Mijoz sayti qobig'i: hamma ekran (tab ham, stack ham) ustida bitta sarlavha.
 * enabled=false bo'lsa ham daraxt shakli o'zgarmaydi — o'lcham o'zgarganda navigatsiya holati yo'qolmasin.
 */
export function WebShell({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { colors } = useTheme();
  useWebFocusRing(enabled);
  return (
    <SiteContext value={enabled}>
      <View style={[{ flex: 1 }, enabled && { backgroundColor: colors.background }]}>
        {enabled && <WebHeader />}
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </SiteContext>
  );
}
