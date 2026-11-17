import { useNavigate } from 'react-router';
import { DotsThree, type IconType } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useI18n } from '@/i18n';
import { usePhone } from '@/lib/hooks';
import { IconButton } from './IconButton';

export interface ToolbarAction {
  icon: IconType;
  label: string;
  to?: string;
  onClick?: () => void;
}

/** Ikkinchi darajali amallar: kattaroq ekranda — ikonkalar (tooltip bilan), telefonda — bitta "…" menyusi (nomlari bilan) */
export function ToolbarActions({ items }: { items: ToolbarAction[] }) {
  const { t } = useI18n();
  const phone = usePhone();
  const navigate = useNavigate();

  if (!phone) return items.map((a) => <IconButton key={a.label} icon={a.icon} label={a.label} to={a.to} onClick={a.onClick} />);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t('common.actions')} title={t('common.actions')}>
          <DotsThree />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {items.map((a) => (
          <DropdownMenuItem key={a.label} onSelect={() => (a.to ? navigate(a.to) : a.onClick?.())}>
            {a.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
