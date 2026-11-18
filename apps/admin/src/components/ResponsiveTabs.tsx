import { useState } from 'react';
import { Check, ChevronDown } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePhone } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Segmented } from './Segmented';

export interface TabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  /** Son e'tibor talab qiladi (masalan, tekshiruv kutayotganlar) */
  urgent?: boolean;
}

/** Shu sondan ko'p bo'lsa telefonda segment sig'maydi — pastdan chiqadigan ro'yxat */
const SEGMENT_MAX = 3;

function Count({ o, active }: { o: TabOption<string>; active?: boolean }) {
  if (o.count === undefined || (o.urgent && !o.count)) return null;
  return o.urgent ? (
    <span className="rounded-full bg-warning/15 px-1.5 text-[11px] leading-4 font-semibold text-warning tabular">{o.count}</span>
  ) : (
    <span className={cn('text-xs tabular', active ? 'text-primary' : 'text-muted-foreground')}>{o.count}</span>
  );
}

/**
 * Bo'lim tablari, aylantirishsiz. Kattaroq ekranda — chiziqli tablar; telefonda kam bo'lsa — teng bo'lingan segment,
 * ko'p bo'lsa — joriy tab tugmasi va pastdan chiqadigan ro'yxat (sonlari bilan).
 */
export function ResponsiveTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: TabOption<T>[];
  label: string;
  className?: string;
}) {
  const phone = usePhone();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];

  if (!phone)
    return (
      <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={className}>
        <TabsList variant="line" aria-label={label} className="h-auto w-full justify-start gap-4 rounded-none border-b p-0">
          {options.map((o) => (
            // Tanlangan chiziq pastki chegara ustida (kesilmaydi)
            <TabsTrigger key={o.value} value={o.value} className="h-9 flex-none gap-1.5 px-0.5 group-data-[orientation=horizontal]/tabs:after:bottom-[-1px]">
              {o.label}
              <Count o={o} active={o.value === value} />
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    );

  if (options.length <= SEGMENT_MAX)
    return (
      <Segmented
        className={cn('flex w-full [&>button]:flex-1 [&>button]:justify-center', className)}
        label={label}
        value={value}
        onChange={onChange}
        options={options.map((o) => ({ value: o.value, label: o.label, count: o.count }))}
      />
    );

  if (!current) return null;
  return (
    <>
      <Button variant="outline" className={cn('w-full justify-between', className)} aria-label={`${label}: ${current.label}`} onClick={() => setOpen(true)}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{current.label}</span>
          <Count o={current} active />
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl p-0 pb-[var(--safe-bottom)]">
          <SheetTitle className="px-4 pt-4 pb-2 text-base">{label}</SheetTitle>
          <div role="radiogroup" aria-label={label} className="px-2 pb-3">
            {options.map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn('flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium', on ? 'bg-primary/10 text-primary' : 'hover:bg-accent')}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  <Count o={o} active={on} />
                  <Check className={cn('size-4', !on && 'invisible')} />
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
