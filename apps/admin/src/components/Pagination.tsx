import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

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
    <nav aria-label={t('common.pageOf', { page, pages })} className={cn('flex items-center justify-between gap-3 text-sm', className)}>
      <span className="text-muted-foreground tabular">{t('common.totalCount', { n: total })}</span>
      <div className="flex items-center gap-1.5">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('common.prev')}>
          <ChevronLeft />
          <span className="hidden sm:inline">{t('common.prev')}</span>
        </Button>
        <span className="min-w-14 text-center text-muted-foreground tabular">{t('common.pageOf', { page, pages })}</span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('common.next')}>
          <span className="hidden sm:inline">{t('common.next')}</span>
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
