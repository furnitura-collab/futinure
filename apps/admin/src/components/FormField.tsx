import { useId, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export interface FieldProps {
  id: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Label + maydon + yordamchi/xato matni. Maydonga id va aria-* render-prop orqali beriladi */
export function FormField({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: (field: FieldProps) => ReactNode;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className={cn('grid gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': note ? noteId : undefined })}
      {note && (
        <p id={noteId} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {note}
        </p>
      )}
    </div>
  );
}
