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
  // Deyarli oq, juda yengil iliq tus — kartalar (oq) undan ajralib turadi
  background: '#f8f6f3',
  foreground: '#1c1917',
  card: '#ffffff',
  cardForeground: '#1c1917',
  popover: '#ffffff',
  popoverForeground: '#1c1917',
  primary: '#b45309',
  primaryForeground: '#ffffff',
  secondary: '#f5f5f4',
  secondaryForeground: '#1c1917',
  muted: '#f2efeb',
  // AA kontrast: oq va fon ustida ≥ 4.5:1
  mutedForeground: '#68615b',
  accent: '#fef3c7',
  accentForeground: '#92400e',
  destructive: '#be123c',
  destructiveForeground: '#ffffff',
  success: '#047857',
  warning: '#a16207',
  info: '#0369a1',
  violet: '#6d28d9',
  border: '#e7e5e4',
  input: '#d6d3d1',
  ring: 'rgba(180, 83, 9, 0.45)',
  glass: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(214, 211, 209, 0.6)',
  glassSolid: 'rgba(255, 255, 255, 0.94)',
  placeholder: '#968e87',
  primarySoft: '#fef3c7',
  successSoft: '#d1fae5',
  warningSoft: '#fef9c3',
  destructiveSoft: '#ffe4e6',
  infoSoft: '#e0f2fe',
  violetSoft: '#ede9fe',
  overlay: 'rgba(28, 25, 23, 0.42)',
  tints: [
    { bg: '#fdf1dc', fg: '#b45309', shape: '#f8dcae' },
    { bg: '#e3f1fb', fg: '#0369a1', shape: '#c5e2f6' },
    { bg: '#e2f5ec', fg: '#047857', shape: '#c0e9d5' },
    { bg: '#fbe6ea', fg: '#be123c', shape: '#f5c8d2' },
    { bg: '#ece8fb', fg: '#6d28d9', shape: '#d8cff6' },
    { bg: '#efebe6', fg: '#57534e', shape: '#ddd6ce' },
  ],
};

const dark: ThemeColors = {
  background: '#0e0c0b',
  foreground: '#fafaf9',
  card: '#1c1917',
  cardForeground: '#fafaf9',
  popover: '#1c1917',
  popoverForeground: '#fafaf9',
  primary: '#f59e0b',
  primaryForeground: '#1c1917',
  secondary: '#292524',
  secondaryForeground: '#fafaf9',
  muted: '#292524',
  mutedForeground: '#a8a29e',
  accent: 'rgba(245, 158, 11, 0.14)',
  accentForeground: '#fcd34d',
  destructive: '#fb7185',
  destructiveForeground: '#1c1917',
  success: '#34d399',
  warning: '#fbbf24',
  info: '#38bdf8',
  violet: '#a78bfa',
  border: '#292524',
  input: '#44403c',
  ring: 'rgba(245, 158, 11, 0.5)',
  glass: 'rgba(28, 25, 23, 0.66)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  glassSolid: 'rgba(28, 25, 23, 0.96)',
  placeholder: '#78716c',
  primarySoft: 'rgba(245, 158, 11, 0.16)',
  successSoft: 'rgba(52, 211, 153, 0.14)',
  warningSoft: 'rgba(251, 191, 36, 0.14)',
  destructiveSoft: 'rgba(251, 113, 133, 0.14)',
  infoSoft: 'rgba(56, 189, 248, 0.14)',
  violetSoft: 'rgba(167, 139, 250, 0.16)',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tints: [
    { bg: '#2a2016', fg: '#fbbf24', shape: '#3a2b1a' },
    { bg: '#152330', fg: '#7dd3fc', shape: '#1c3142' },
    { bg: '#132820', fg: '#6ee7b7', shape: '#1a372c' },
    { bg: '#2c1820', fg: '#fda4af', shape: '#3d212c' },
    { bg: '#211b33', fg: '#c4b5fd', shape: '#2d2546' },
    { bg: '#24201d', fg: '#d6d3d1', shape: '#322d29' },
  ],
};

export const THEMES: Record<Scheme, Theme> = {
  light: {
    scheme: 'light',
    colors: light,
    shadow: { boxShadow: '0 1px 2px rgba(28, 25, 23, 0.05), 0 2px 8px rgba(28, 25, 23, 0.04)' },
    shadowLg: { boxShadow: '0 12px 32px rgba(28, 25, 23, 0.14)' },
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
