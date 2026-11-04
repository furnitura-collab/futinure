import { DarkTheme, DefaultTheme, type Theme as NavTheme } from 'expo-router';
import { useMemo } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GlassView } from '@/components/ui';
import { useTheme } from '@/theme';

/** Sarlavha foni: iOS'da tizim blur'i (native), boshqa joyda — GlassView */
function HeaderGlass() {
  const { colors } = useTheme();
  return <GlassView bordered={false} style={[StyleSheet.absoluteFill, { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }]} />;
}

/** Stack va Tabs uchun umumiy shisha sarlavha sozlamalari va navigatsiya mavzusi */
export function useNavChrome() {
  const theme = useTheme();
  const { colors, scheme } = theme;

  const navTheme = useMemo<NavTheme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.card,
        text: colors.foreground,
        border: colors.border,
        notification: colors.primary,
      },
    };
  }, [scheme, colors]);

  const header = useMemo(
    () => ({
      headerTransparent: true,
      headerShadowVisible: false,
      headerTintColor: colors.accentForeground,
      headerTitleStyle: { color: colors.foreground, fontWeight: '600' as const },
      ...(Platform.OS === 'ios'
        ? { headerBlurEffect: scheme === 'dark' ? ('systemChromeMaterialDark' as const) : ('systemChromeMaterialLight' as const) }
        : { headerBackground: HeaderGlass }),
    }),
    [colors, scheme],
  );

  return { navTheme, header };
}
