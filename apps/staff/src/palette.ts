/** Admin panel fon ranglari bilan bir xil — WebView yuklanguncha va xavfsiz hududda "yalt" etmasin */
export const PALETTE = {
  light: { background: '#f7f6fb', foreground: '#1b1a24', muted: '#5f5b6e', primary: '#7c3aed' },
  dark: { background: '#0f0d16', foreground: '#f7f6fb', muted: '#a7a3b6', primary: '#a78bfa' },
} as const;

export type Palette = (typeof PALETTE)[keyof typeof PALETTE];
