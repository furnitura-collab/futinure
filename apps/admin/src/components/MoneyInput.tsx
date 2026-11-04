import type { ComponentProps } from 'react';
import { formatMoney, formatNumber } from '@mebel/shared';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/** "4 620 000" ko'rinishida yoziladigan pul maydoni (butun so'm) */
export function MoneyInput({
  value,
  onChange,
  className,
  placeholder = '0',
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & { value: number; onChange: (v: number) => void }) {
  const { locale } = useI18n();
  const currency = formatMoney(0, locale).replace(/^0\s*/, '');
  return (
    <div className={cn('relative', className)}>
      <Input
        {...rest}
        inputMode="numeric"
        className="pr-14 text-right tabular"
        value={value ? formatNumber(value) : ''}
        placeholder={placeholder}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{currency}</span>
    </div>
  );
}
