import type { ViewStyle } from 'react-native';

/** Admin panel (shadcn) bilan bir xil token nomlari — faqat camelCase */
export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  warning: string;
  info: string;
  violet: string;
  border: string;
  input: string;
  ring: string;
  glass: string;
  glassBorder: string;
  /** Blur yo'q joyda (Android) — shaffofroq emas, o'qilishi uchun */
  glassSolid: string;
  placeholder: string;
  /** Holat ranglarining yumshoq foni (badge, ogohlantirish kartasi) */
  primarySoft: string;
  successSoft: string;
  warningSoft: string;
  destructiveSoft: string;
  infoSoft: string;
  violetSoft: string;
  /** Modal/sheet ortidagi qoraytirish */
  overlay: string;
  /** Kategoriya illyustratsiyalari (rasmsiz mahsulot) — har kategoriya o'z rangida */
  tints: readonly Tint[];
}

export interface Tint {
  bg: string;
  fg: string;
  /** Illyustratsiyadagi ikkinchi darajali shakllar */
  shape: string;
}

export type Scheme = 'light' | 'dark';

export interface Theme {
  scheme: Scheme;
  colors: ThemeColors;
  shadow: ViewStyle;
  shadowLg: ViewStyle;
}

const light: ThemeColors = {
  // Yengil purple tusli oq — kartalar (oq) undan ajralib turadi
  background: '#f7f6fb',
  foreground: '#1b1a24',
  card: '#ffffff',
  cardForeground: '#1b1a24',
  popover: '#ffffff',
  popoverForeground: '#1b1a24',
  primary: '#7c3aed',
  primaryForeground: '#ffffff',
  secondary: '#f1f0f6',
  secondaryForeground: '#1b1a24',
  muted: '#f1f0f6',
  // AA kontrast: oq va fon ustida ≥ 4.5:1
  mutedForeground: '#5f5b6e',
  accent: '#ede9fe',
  accentForeground: '#6d28d9',
  destructive: '#be123c',
  destructiveForeground: '#ffffff',
  success: '#047857',
  warning: '#a16207',
  info: '#0369a1',
  violet: '#4f46e5',
  border: '#e6e4ee',
  input: '#d5d2e0',
  ring: 'rgba(124, 58, 237, 0.45)',
  glass: 'rgba(255, 255, 255, 0.78)',
  glassBorder: 'rgba(27, 26, 36, 0.08)',
  glassSolid: 'rgba(255, 255, 255, 0.94)',
  placeholder: '#8e8a9e',
  primarySoft: '#ede9fe',
  successSoft: '#d1fae5',
  warningSoft: '#fef9c3',
  destructiveSoft: '#ffe4e6',
  infoSoft: '#e0f2fe',
  violetSoft: '#e0e7ff',
  overlay: 'rgba(27, 26, 36, 0.42)',
  tints: [
    { bg: '#efe9fd', fg: '#6d28d9', shape: '#ddd2fb' },
    { bg: '#e3f1fb', fg: '#0369a1', shape: '#c5e2f6' },
    { bg: '#e2f5ec', fg: '#047857', shape: '#c0e9d5' },
    { bg: '#fbe6ea', fg: '#be123c', shape: '#f5c8d2' },
    { bg: '#fdf1dc', fg: '#b45309', shape: '#f8dcae' },
    { bg: '#eeedf3', fg: '#57536a', shape: '#dcdae6' },
  ],
};

const dark: ThemeColors = {
  background: '#0e0c15',
  foreground: '#f7f6fb',
  card: '#1a1823',
  cardForeground: '#f7f6fb',
  popover: '#1a1823',
  popoverForeground: '#f7f6fb',
  primary: '#a78bfa',
  primaryForeground: '#1a1033',
  secondary: '#252231',
  secondaryForeground: '#f7f6fb',
  muted: '#252231',
  mutedForeground: '#a7a3b6',
  accent: 'rgba(167, 139, 250, 0.16)',
  accentForeground: '#ddd6fe',
  destructive: '#fb7185',
  destructiveForeground: '#1b1a24',
  success: '#34d399',
  warning: '#fbbf24',
  info: '#38bdf8',
  violet: '#818cf8',
  border: '#2a2737',
  input: '#3a364a',
  ring: 'rgba(167, 139, 250, 0.5)',
  // Shaffofroq bo'lsa ostidagi purple tugmalar panel orqali dog' bo'lib ko'rinadi
  glass: 'rgba(26, 24, 35, 0.82)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassSolid: 'rgba(26, 24, 35, 0.96)',
  placeholder: '#7a7590',
  primarySoft: 'rgba(167, 139, 250, 0.16)',
  successSoft: 'rgba(52, 211, 153, 0.14)',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  destructiveSoft: 'rgba(251, 113, 133, 0.14)',
  infoSoft: 'rgba(56, 189, 248, 0.14)',
  violetSoft: 'rgba(129, 140, 248, 0.16)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tints: [
    { bg: '#221a36', fg: '#c4b5fd', shape: '#2e2449' },
    { bg: '#152330', fg: '#7dd3fc', shape: '#1c3142' },
    { bg: '#132820', fg: '#6ee7b7', shape: '#1a372c' },
    { bg: '#2c1820', fg: '#fda4af', shape: '#3d212c' },
    { bg: '#2a2016', fg: '#fbbf24', shape: '#3a2b1a' },
    { bg: '#1f1d28', fg: '#d4d2dd', shape: '#2b2836' },
  ],
};

export const THEMES: Record<Scheme, Theme> = {
  light: {
    scheme: 'light',
    colors: light,
    shadow: { boxShadow: '0 1px 2px rgba(27, 26, 36, 0.05), 0 2px 8px rgba(27, 26, 36, 0.04)' },
    shadowLg: { boxShadow: '0 12px 32px rgba(27, 26, 36, 0.14)' },
  },
  dark: {
    scheme: 'dark',
    colors: dark,
    shadow: { boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' },
    shadowLg: { boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)' },
  },
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;
export const font = { xs: 12, sm: 13, base: 15, lg: 17, xl: 20, '2xl': 24, '3xl': 30 } as const;
export const space = (n: number) => n * 4;
/** Animatsiya davomiyligi (ms) — 150–250 oralig'ida */
export const motion = { fast: 150, base: 200, slow: 250 } as const;

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info' | 'violet';

export function toneColors(c: ThemeColors, tone: Tone): { fg: string; bg: string } {
  switch (tone) {
    case 'primary':
      return { fg: c.accentForeground, bg: c.primarySoft };
    case 'success':
      return { fg: c.success, bg: c.successSoft };
    case 'warning':
      return { fg: c.warning, bg: c.warningSoft };
    case 'destructive':
      return { fg: c.destructive, bg: c.destructiveSoft };
    case 'info':
      return { fg: c.info, bg: c.infoSoft };
    case 'violet':
      return { fg: c.violet, bg: c.violetSoft };
    default:
      return { fg: c.mutedForeground, bg: c.muted };
  }
}
