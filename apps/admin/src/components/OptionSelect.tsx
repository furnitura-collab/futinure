import type { ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface Option {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

/** Radix bo'sh qiymatni qabul qilmaydi — "hammasi / tanlanmagan" uchun ichki belgi */
const EMPTY = '__empty__';

/** Variantlar ro'yxatidan tanlash. `emptyLabel` berilsa — bo'sh qiymat ('') ham tanlanadi */
export function OptionSelect({
  value,
  onValueChange,
  options,
  emptyLabel,
  placeholder,
  disabled,
  className,
  size,
  id,
  ...aria
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: Option[];
  emptyLabel?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'default';
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
}) {
  const current = value === '' ? (emptyLabel !== undefined ? EMPTY : undefined) : value;
  return (
    <Select value={current} onValueChange={(v) => onValueChange(v === EMPTY ? '' : v)} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={cn('w-full', className)} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" className="max-h-80">
        {emptyLabel !== undefined && <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
