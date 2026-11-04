import type { ReactNode } from 'react';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const SIZE = { md: 'sm:max-w-lg', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' } as const;

/**
 * Oyna faqat kerak bo'lganda chiziladi (`{open && <X />}`) — yopilganda ichki forma holati tozalanadi.
 * Sarlavha, aylantiriladigan tana va pastki tugmalar paneli.
 */
export function FormDialog({
  title,
  description,
  onClose,
  footer,
  size = 'md',
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: keyof typeof SIZE;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn(SIZE[size], className)} {...(description ? {} : { 'aria-describedby': undefined })}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
