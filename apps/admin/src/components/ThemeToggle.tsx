import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useI18n } from '@/i18n';
import { THEMES, useTheme, type Theme } from '@/lib/theme';

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeRadioItems() {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
      {THEMES.map((th) => {
        const Icon = THEME_ICON[th];
        return (
          <DropdownMenuRadioItem key={th} value={th}>
            <Icon className="text-muted-foreground" /> {t(`theme.${th}`)}
          </DropdownMenuRadioItem>
        );
      })}
    </DropdownMenuRadioGroup>
  );
}

export function ThemeToggle() {
  const { t } = useI18n();
  const { resolved } = useTheme();
  const Icon = resolved === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('theme.title')} title={t('theme.title')}>
          <Icon className="transition-transform duration-200 ease-out" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t('theme.title')}</DropdownMenuLabel>
        <ThemeRadioItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
