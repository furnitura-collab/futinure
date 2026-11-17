import { Hint } from '@/components/IconButton';
import type { IconType } from '@/components/icons';
import { buttonVariants } from '@/components/ui/button';

/** Ikonkali havola (qo'ng'iroq, xarita): IconButton bilan bir xil ko'rinish, lekin <a> */
export function IconLink({
  href,
  icon: Icon,
  label,
  external,
  size = 'icon-sm',
}: {
  href: string;
  icon: IconType;
  label: string;
  external?: boolean;
  size?: 'icon-sm' | 'icon-xs';
}) {
  return (
    <Hint label={label}>
      <a
        href={href}
        aria-label={label}
        className={buttonVariants({ variant: 'ghost', size })}
        {...(external && { target: '_blank', rel: 'noreferrer' })}
      >
        <Icon />
      </a>
    </Hint>
  );
}
