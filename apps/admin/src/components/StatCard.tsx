import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TONE_TEXT, type Tone } from './tone';

export function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
  loading,
  to,
  emphasize,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  loading?: boolean;
  to?: string;
  /** Qiymatni ton rangida ko'rsatish (masalan muddati o'tgan qarz) */
  emphasize?: boolean;
}) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-20" />
      ) : (
        <p className={cn('mt-0.5 text-lg leading-snug font-semibold tracking-tight tabular', emphasize && TONE_TEXT[tone])}>{value}</p>
      )}
      {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls =
    'surface block rounded-xl border px-4 py-3 transition-[box-shadow,transform,border-color] duration-200 ease-out animate-fade-up';
  return to ? (
    <Link to={to} className={cn(cls, 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
