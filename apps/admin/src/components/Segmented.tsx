import type { IconType } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Hint } from './IconButton';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Berilsa — faqat ikonka ko'rinadi, nomi tooltip va aria-label'da */
  icon?: IconType;
  count?: number;
}

/** Bitta tanlovli segment (filtr, ko'rinish): bir bosishda almashadi, tor ekranda gorizontal aylanadi */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex max-w-full overflow-x-auto rounded-lg bg-muted/70 p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        const button = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.icon ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow] duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              o.icon ? 'w-8 justify-center' : 'px-3',
              on ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.icon ? <o.icon className="size-4" weight={on ? 'bold' : 'regular'} /> : o.label}
            {o.count !== undefined && (
              <span className={cn('text-xs tabular', on ? 'text-primary' : 'text-muted-foreground/80')}>{o.count}</span>
            )}
          </button>
        );
        return o.icon ? (
          <Hint key={o.value} label={o.label}>
            {button}
          </Hint>
        ) : (
          button
        );
      })}
    </div>
  );
}
