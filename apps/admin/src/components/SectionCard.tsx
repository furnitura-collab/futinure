import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** Sarlavhali karta: sarlavha + amallar + tana. `flush` — jadval uchun ichki chekinishsiz */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  flush?: boolean;
}) {
  return (
    <Card className={cn('gap-0 overflow-hidden py-0', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && 'p-5', contentClassName)}>{children}</div>
    </Card>
  );
}
