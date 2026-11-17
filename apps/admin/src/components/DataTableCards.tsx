import type { KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';
import type { Column } from './DataTable';

/**
 * Telefonda (< sm) jadval qatori — karta: birinchi ustun sarlavha, qolganlari "nomi · qiymat".
 * `hideBelow` belgilangan ustunlar telefonda ko'rsatilmaydi (jadvaldagi bilan bir xil qoida).
 */
export function DataTableCards<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  loading,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | false | undefined;
  loading?: boolean;
}) {
  const [head, ...rest] = columns.filter((c) => !c.hideBelow);
  const onKey = (row: T) => (e: KeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onRowClick?.(row);
    }
  };
  return (
    <ul className={cn('divide-y transition-opacity duration-200 sm:hidden', loading && 'opacity-60')}>
      {rows.map((row) => (
        <li
          key={rowKey(row)}
          tabIndex={onRowClick ? 0 : undefined}
          onClick={onRowClick && (() => onRowClick(row))}
          onKeyDown={onRowClick && onKey(row)}
          className={cn('space-y-2 px-4 py-3 text-sm', onRowClick && 'cursor-pointer active:bg-primary/6', rowClassName?.(row))}
        >
          {head && <div className="min-w-0">{head.cell(row)}</div>}
          {rest.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1">
              {rest.map((c) => (
                <div key={c.id} className="contents">
                  <dt className="text-xs text-muted-foreground">{c.header}</dt>
                  <dd className={cn('min-w-0 justify-self-end text-right', c.className)}>{c.cell(row)}</dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}
