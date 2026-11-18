import type { ComponentProps } from 'react';
import { formatUzPhoneInput } from '@mebel/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  /** Faqat mahalliy qism: "90 123 45 67" (to'liq raqam joylashtirilsa ham shu ko'rinishga keladi) */
  value: string;
  onChange: (local: string) => void;
  /** Katta maydon (kirish sahifasi) — prefiks ham shu o'lchamda */
  large?: boolean;
};

/** O'zbekiston raqami: "+998" doim ko'rinadigan o'zgarmas prefiks, 9 raqam guruhlab yoziladi */
export function PhoneInput({ value, onChange, className, disabled, large, ...props }: Props) {
  return (
    <div className="relative">
      <span
        aria-hidden
        className={cn('pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base tabular', !large && 'md:text-sm', disabled ? 'text-muted-foreground' : 'text-foreground')}
      >
        +998
      </span>
      <Input
        {...props}
        disabled={disabled}
        className={cn('pl-[3.4rem] tabular', className)}
        type="tel"
        inputMode="tel"
        placeholder="90 123 45 67"
        value={value}
        onChange={(e) => onChange(formatUzPhoneInput(e.target.value))}
      />
    </div>
  );
}
