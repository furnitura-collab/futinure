import { KeyRound, Languages, LogOut, Palette } from 'lucide-react';
import { useState } from 'react';
import { formatPhone } from '@mebel/shared';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import type { Me } from '@/lib/types';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { LanguageRadioItems } from './LanguageSwitcher';
import { ThemeRadioItems } from './ThemeToggle';

function initials(me: Me) {
  const parts = (me.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') : me.phone.slice(-2);
}

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
          <Avatar className="size-9 ring-1 ring-border">
            <AvatarFallback className="bg-primary/12 text-xs font-semibold text-primary">{initials(me)}</AvatarFallback>
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
            <KeyRound /> {t('profile.changePassword')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages className="text-muted-foreground" /> {t('language.title')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <LanguageRadioItems />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="text-muted-foreground" /> {t('theme.title')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-44">
              <ThemeRadioItems />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void logout()}>
            <LogOut /> {t('profile.logout')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={changing} onOpenChange={setChanging} />
    </>
  );
}
