import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Bir nechtasini tanlash mumkin bo'lgan "chip"lar (masalan to'lov usullari) */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value])}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm ring-1 transition-[background-color,color,box-shadow,transform] duration-150 ease-out outline-none active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
              on ? 'bg-primary text-primary-foreground ring-primary' : 'bg-card text-muted-foreground ring-border hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {on && <Check className="size-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
