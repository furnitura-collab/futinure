import type { ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Shaxs: bosh harfli avatar, nom va ikkinchi qator (telefon, rol…) */
export function Identity({
  name,
  phone,
  subtitle,
  muted,
  className,
}: {
  name: string | null;
  phone: string;
  subtitle?: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className={cn('text-[11px] font-semibold', muted ? 'bg-muted text-muted-foreground' : 'bg-primary/12 text-primary')}>
          {initials(name, phone)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate font-medium">{name || '—'}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
