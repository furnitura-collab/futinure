import * as SystemUI from 'expo-system-ui';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { secureStorage } from '@/lib/storage';
import { THEMES, type Theme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';
const PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];
const KEY = 'mebel.theme';

const isPreference = (v: unknown): v is ThemePreference => PREFERENCES.includes(v as ThemePreference);

/** Standart — yorug' mavzu (ustaxonada kunduzi o'qish oson); tizim mavzusi faqat tanlansa */
const DEFAULT: ThemePreference = 'light';

/** Webda localStorage sinxron — birinchi chizishdayoq to'g'ri mavzu (noto'g'ri rang "miltillamasin") */
function initialPreference(): ThemePreference {
  if (Platform.OS !== 'web') return DEFAULT;
  try {
    const v = localStorage.getItem(KEY);
    return isPreference(v) ? v : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

interface ThemeState {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const Ctx = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>(initialPreference);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void secureStorage.get(KEY).then((v) => {
      if (isPreference(v)) setPref(v);
    });
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    void secureStorage.set(KEY, p);
  }, []);

  const scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const theme = THEMES[scheme];

  // Android navigatsiya paneli va iOS modal ortidagi fon ham mavzuga mos
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background).catch(() => undefined);
    if (Platform.OS === 'web') document.documentElement.style.colorScheme = scheme;
  }, [theme, scheme]);

  const value = useMemo(() => ({ theme, preference, setPreference }), [theme, preference, setPreference]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useThemeSettings() {
  const c = use(Ctx);
  if (!c) throw new Error('ThemeProvider kerak');
  return c;
}

export function useTheme(): Theme {
  return useThemeSettings().theme;
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/** Mavzuga bog'liq stillar: `const useStyles = makeStyles((t) => ({...}))`, komponentda `const s = useStyles()` */
export function makeStyles<T extends NamedStyles<T>>(factory: (theme: Theme) => T) {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
