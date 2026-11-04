import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TotalRow {
  label: ReactNode;
  value: ReactNode;
  strong?: boolean;
  className?: string;
}

/** Summalar ro'yxati: chapda nom, o'ngda qiymat (yakuniy qator qalin) */
export function TotalsList({ rows, className }: { rows: (TotalRow | false | null | undefined)[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm', className)}>
      {rows.filter((r): r is TotalRow => !!r).map((r, i) => (
        <div key={i} className={cn('contents', r.strong && 'font-semibold')}>
          <dt className={cn(!r.strong && 'text-muted-foreground', r.strong && 'border-t pt-1.5')}>{r.label}</dt>
          <dd className={cn('text-right tabular', r.strong && 'border-t pt-1.5', r.className)}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
