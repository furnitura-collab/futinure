import { useState } from 'react';
import { ResponsiveTabs } from '@/components/ResponsiveTabs';
import { useI18n } from '@/i18n';
import type { KanbanColumn } from '@/lib/types';
import { BoardCard } from './BoardCard';

/**
 * Telefonda kanban o'rniga: holat tanlovi (soni bilan) va tanlangan holat ro'yxati — bir ustun ekranni
 * band qilmaydi. Holat buyurtma sahifasidagi pastki tugmalar bilan o'zgartiriladi.
 */
export function MobileBoard({ columns }: { columns: KanbanColumn[] }) {
  const { t, label } = useI18n();
  const [picked, setPicked] = useState(() => (columns.find((c) => c.total > 0) ?? columns[0])?.status);
  const col = columns.find((c) => c.status === picked) ?? columns[0];
  if (!col) return null;

  return (
    <div className="space-y-3">
      <ResponsiveTabs
        label={t('orders.statusFilter')}
        value={col.status}
        onChange={setPicked}
        options={columns.map((c) => ({ value: c.status, label: label('orderStatus', c.status), count: c.total }))}
      />
      <div className="space-y-2">
        {col.items.map((o) => (
          <BoardCard key={o.id} order={o} movable={false} busy={false} />
        ))}
        {col.items.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">{t('orders.columnEmpty')}</p>}
        {col.total > col.items.length && <p className="py-2 text-center text-xs text-muted-foreground">{t('orders.more', { n: col.total - col.items.length })}</p>}
      </div>
    </div>
  );
}
