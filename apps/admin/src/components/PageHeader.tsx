import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

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
    <header className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1">
        {back && (
          <Link
            to={back.to}
            className="mb-1 inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" /> {back.label}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{title}</h1>
          {meta}
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
