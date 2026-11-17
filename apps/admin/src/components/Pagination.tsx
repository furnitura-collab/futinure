import { ChevronLeft, ChevronRight } from '@/components/icons';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';
import { IconButton } from './IconButton';

export interface PaginationState {
  page: number;
  total: number;
  limit: number;
  onPage: (p: number) => void;
}

export function Pagination({ page, total, limit, onPage, className }: PaginationState & { className?: string }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / limit));
  if (pages <= 1) return null;
  return (
    <nav aria-label={t('common.pageOf', { page, pages })} className={cn('flex items-center justify-between gap-3 text-xs', className)}>
      <span className="text-muted-foreground tabular">{t('common.totalCount', { n: total })}</span>
      <div className="flex items-center gap-1.5">
        <IconButton icon={ChevronLeft} label={t('common.prev')} variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)} />
        <span className="min-w-14 text-center text-muted-foreground tabular">{t('common.pageOf', { page, pages })}</span>
        <IconButton icon={ChevronRight} label={t('common.next')} variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)} />
      </div>
    </nav>
  );
}
