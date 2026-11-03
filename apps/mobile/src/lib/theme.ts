/** Admin panel bilan bir xil brend ranglari */
export const colors = {
  brand: '#b45309',
  brandDark: '#92400e',
  brandSoft: '#fef3c7',
  brandBg: '#fffbeb',
  text: '#1c1917',
  muted: '#78716c',
  faint: '#a8a29e',
  border: '#e7e5e4',
  bg: '#fafaf9',
  card: '#ffffff',
  success: '#047857',
  successSoft: '#d1fae5',
  warning: '#b45309',
  warningSoft: '#fef3c7',
  danger: '#be123c',
  dangerSoft: '#ffe4e6',
  info: '#0369a1',
  infoSoft: '#e0f2fe',
  violet: '#6d28d9',
  violetSoft: '#ede9fe',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;
export const space = (n: number) => n * 4;
