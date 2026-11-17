import type { ComponentProps, ReactElement, ReactNode } from 'react';
import { Link } from 'react-router';
import type { IconType } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Side = 'top' | 'right' | 'bottom' | 'left';

/** Hover/focus'da kichik tooltip — har qanday trigger uchun (tugma, havola, belgi) */
export function Hint({ label, side = 'top', children }: { label: ReactNode; side?: Side; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

type IconButtonProps = Omit<ComponentProps<typeof Button>, 'children' | 'size' | 'asChild'> & {
  icon: IconType;
  label: string;
  size?: 'icon' | 'icon-sm' | 'icon-xs' | 'icon-lg';
  side?: Side;
  /** Berilsa — havola (ichki yo'l) */
  to?: string;
};

/** Faqat ikonkali amal: nomi aria-label va tooltip'da */
export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'icon-sm', side, loading, to, disabled, ...props }: IconButtonProps) {
  const button = to ? (
    <Button asChild variant={variant} size={size} aria-label={label} {...props}>
      <Link to={to}>
        <Icon />
      </Link>
    </Button>
  ) : (
    <Button variant={variant} size={size} aria-label={label} loading={loading} disabled={disabled} {...props}>
      {!loading && <Icon />}
    </Button>
  );
  // O'chirilgan tugma hover hodisasini olmaydi — tooltip (nega o'chirilgan) o'rovchida ko'rinadi
  return (
    <Hint label={label} side={side}>
      {disabled ? (
        <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          {button}
        </span>
      ) : (
        button
      )}
    </Hint>
  );
}
