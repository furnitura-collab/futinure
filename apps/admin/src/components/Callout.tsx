import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_SOFT, TONE_TEXT } from './tone';

const ICONS = { info: Info, warning: AlertTriangle, success: CheckCircle2, destructive: XCircle } as const;

/** Sahifa ichidagi ogohlantirish / ma'lumot bloki */
export function Callout({
  tone = 'info',
  children,
  className,
  icon = true,
}: {
  tone?: keyof typeof ICONS;
  children: ReactNode;
  className?: string;
  icon?: boolean;
}) {
  const Icon = ICONS[tone];
  return (
    <div role={tone === 'destructive' ? 'alert' : 'status'} className={cn('flex items-start gap-2.5 rounded-lg p-3 text-sm ring-1', TONE_SOFT[tone], className)}>
      {icon && <Icon className={cn('mt-0.5 size-4 shrink-0', TONE_TEXT[tone])} />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
