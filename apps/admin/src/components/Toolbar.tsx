import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Bitta qator: chapda qidiruv va filtrlar, o'ngda amallar (tor ekranda o'raladi) */
export function Toolbar({ children, actions, className }: { children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {children}
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </div>
  );
}
