import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { EmptyState, type EmptyStateProps } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Pagination, type PaginationState } from './Pagination';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Berilsa — ustun sarlavhasi bosilganda joriy sahifa shu qiymat bo'yicha saralanadi */
  sortValue?: (row: T) => string | number | null;
  align?: 'left' | 'right';
  className?: string;
  /** Tor ekranda yashiriladi */
  hideBelow?: 'sm' | 'md' | 'lg';
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' } as const;

type Sort = { id: string; dir: 'asc' | 'desc' } | null;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  empty,
  onRowClick,
  rowClassName,
  pagination,
  skeletonRows = 6,
  bare,
  className,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  empty: EmptyStateProps;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string | false | undefined;
  pagination?: PaginationState;
  skeletonRows?: number;
  /** Karta ichida — o'z ramkasisiz */
  bare?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [sort, setSort] = useState<Sort>(null);

  const sorted = useMemo(() => {
    if (!rows || !sort) return rows;
    const get = columns.find((c) => c.id === sort.id)?.sortValue;
    if (!get) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, sort, columns]);

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id !== id ? { id, dir: 'asc' } : s.dir === 'asc' ? { id, dir: 'desc' } : null));

  const onKey = (row: T) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  const cellCls = (c: Column<T>) => cn(c.align === 'right' && 'text-right', c.hideBelow && HIDE[c.hideBelow], c.className);

  let body: ReactNode;
  if (error && !rows) {
    body = <ErrorState error={error} onRetry={onRetry} className="m-4 border-0" />;
  } else if (loading && !rows) {
    body = (
      <Table>
        <TableBody>
          {Array.from({ length: skeletonRows }, (_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              {columns.map((c) => (
                <TableCell key={c.id} className={cellCls(c)}>
                  <Skeleton className={cn('h-4', c.align === 'right' ? 'ml-auto w-16' : 'w-3/4')} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else if (!sorted?.length) {
    body = <EmptyState {...empty} />;
  } else {
    body = (
      <Table>
        <TableHeader className="bg-muted/40">
          <TableRow className="hover:bg-transparent">
            {columns.map((c) => {
              const active = sort?.id === c.id ? sort.dir : null;
              return (
                <TableHead
                  key={c.id}
                  aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}
                  className={cn('h-10 px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase', cellCls(c))}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.id)}
                      title={t('common.sort')}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm uppercase transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                        c.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {c.header}
                      {active === 'asc' ? <ArrowUp className="size-3" /> : active === 'desc' ? <ArrowDown className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody className={cn('transition-opacity duration-200', loading && 'opacity-60')}>
          {sorted.map((row) => (
            <TableRow
              key={rowKey(row)}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick && (() => onRowClick(row))}
              onKeyDown={onRowClick && onKey(row)}
              className={cn(
                onRowClick && 'cursor-pointer focus-visible:bg-muted/60 focus-visible:outline-none',
                rowClassName?.(row),
              )}
            >
              {columns.map((c) => (
                <TableCell key={c.id} className={cn('px-4 py-3 whitespace-normal', cellCls(c))}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {bare ? body : <Card className="gap-0 overflow-hidden py-0">{body}</Card>}
      {pagination && <Pagination {...pagination} />}
    </div>
  );
}
