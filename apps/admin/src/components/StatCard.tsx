import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TONE_BADGE, TONE_TEXT, type Tone } from './tone';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  loading,
  to,
  emphasize,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  loading?: boolean;
  to?: string;
  /** Qiymatni ton rangida ko'rsatish (masalan muddati o'tgan qarz) */
  emphasize?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', TONE_BADGE[tone])}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className={cn('mt-1 text-xl font-semibold tracking-tight tabular xl:text-2xl', emphasize && TONE_TEXT[tone])}>{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls =
    'glass block rounded-xl border p-4 shadow-sm transition-[box-shadow,transform,border-color] duration-200 ease-out animate-fade-up';
  return to ? (
    <Link to={to} className={cn(cls, 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
