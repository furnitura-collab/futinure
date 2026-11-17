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
    // Bitta qator: orqaga + sarlavha chapda, amallar o'ngda (joy yetmasa — keyingi qatorga); telefonda izoh yashirin
    <header className={cn('mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2', className)}>
      <div className="flex min-w-0 flex-1 items-start gap-1">
        {back && (
          <Hint label={back.label} side="right">
            <Link
              to={back.to}
              aria-label={back.label}
              className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:size-10 pointer-coarse:-my-1"
            >
              <ArrowLeft className="size-4" />
            </Link>
          </Hint>
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight break-words">{title}</h1>
            {meta}
          </div>
          {description && <p className="text-xs text-muted-foreground max-sm:hidden">{description}</p>}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-1.5">{children}</div>}
    </header>
  );
}
