/** Holat ranglari faqat mavzu tokenlaridan — yorug' va qorong'i mavzuda o'zi moslashadi */
const TONES = ['neutral', 'info', 'violet', 'primary', 'warning', 'teal', 'success', 'destructive'] as const;
export type Tone = (typeof TONES)[number];

export const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  info: 'bg-info/12 text-info ring-info/25',
  violet: 'bg-violet/12 text-violet ring-violet/25',
  primary: 'bg-primary/12 text-primary ring-primary/25',
  warning: 'bg-warning/14 text-warning ring-warning/30',
  teal: 'bg-teal/12 text-teal ring-teal/25',
  success: 'bg-success/12 text-success ring-success/25',
  destructive: 'bg-destructive/12 text-destructive ring-destructive/25',
};

export const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-info',
  violet: 'text-violet',
  primary: 'text-primary',
  warning: 'text-warning',
  teal: 'text-teal',
  success: 'text-success',
  destructive: 'text-destructive',
};

export const TONE_SOFT: Record<Tone, string> = {
  neutral: 'bg-muted/60 text-foreground ring-border',
  info: 'bg-info/8 text-foreground ring-info/20',
  violet: 'bg-violet/8 text-foreground ring-violet/20',
  primary: 'bg-primary/8 text-foreground ring-primary/20',
  warning: 'bg-warning/10 text-foreground ring-warning/25',
  teal: 'bg-teal/8 text-foreground ring-teal/20',
  success: 'bg-success/8 text-foreground ring-success/20',
  destructive: 'bg-destructive/8 text-foreground ring-destructive/20',
};
