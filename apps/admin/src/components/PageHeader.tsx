import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Hint } from './IconButton';

export function PageHeader({
  title,
  description,
  back,
  meta,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { to: string; label: string };
  /** Sarlavha yonidagi nishonlar (holat, sana) */
  meta?: ReactNode;
  /** O'ng tomondagi amallar */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="min-w-0 space-y-0.5">
        {back && (
          <Hint label={back.label} side="right">
            <Link
              to={back.to}
              aria-label={back.label}
              className="-ml-2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ArrowLeft className="size-4" />
            </Link>
          </Hint>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-xl font-semibold tracking-tight break-words">{title}</h1>
          {meta}
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-1.5">{children}</div>}
    </header>
  );
}
