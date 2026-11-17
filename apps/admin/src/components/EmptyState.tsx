import { Inbox } from '@/components/icons';
import type { ReactNode } from 'react';
import type { IconType } from '@/components/icons';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: IconType;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex animate-fade-up flex-col items-center justify-center gap-1.5 px-6 py-10 text-center', className)}>
      <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
