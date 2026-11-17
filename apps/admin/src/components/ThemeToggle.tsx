import { Moon, Sun } from '@/components/icons';
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
import { Hint } from './IconButton';

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, resolved, setTheme } = useTheme();
  const Icon = resolved === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <Hint label={t('theme.title')} side="bottom">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('theme.title')}>
            <Icon />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuLabel className="text-xs text-muted-foreground">{t('theme.title')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {THEMES.map((th) => (
            <DropdownMenuRadioItem key={th} value={th}>
              {t(`theme.${th}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
