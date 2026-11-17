import { useState } from 'react';
import { formatPhone } from '@mebel/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { initials } from '@/lib/format';
import { ChangePasswordDialog } from './ChangePasswordDialog';

export function ProfileMenu() {
  const { t, label } = useI18n();
  const { me, logout } = useAuth();
  const [changing, setChanging] = useState(false);
  if (!me) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('profile.menu')}
          className="rounded-full outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <Avatar className="ml-1 size-8 ring-1 ring-border">
            <AvatarFallback className="bg-primary/12 text-xs font-semibold text-primary">{initials(me.fullName, me.phone)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium">{me.fullName ?? formatPhone(me.phone)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {label('role', me.role)} · {formatPhone(me.phone)}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setChanging(true)}>
            {t('profile.changePassword')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
            {t('profile.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={changing} onOpenChange={setChanging} />
    </>
  );
}
