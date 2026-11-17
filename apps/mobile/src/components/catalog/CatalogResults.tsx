import type { ReactNode } from 'react';
import { Button, Chip, EmptyState, ErrorState, Row, Text } from '@/components/ui';
import { useI18n } from '@/i18n';
import { space } from '@/theme';
import { ProductGridSkeleton } from './ProductGridSkeleton';
import type { ActiveFilter } from './useCatalogFilters';

/** Natijalar soni va faol filtrlar (bosilsa — olib tashlanadi); saytda o'ngida saralash */
export function CatalogSummary({ total, active, right }: { total: number | undefined; active: ActiveFilter[]; right?: ReactNode }) {
  const { t } = useI18n();
  return (
    <Row between style={{ flexWrap: 'wrap', rowGap: space(2), zIndex: 1 }}>
      <Row gap={space(2)} style={{ flexWrap: 'wrap', flexShrink: 1 }}>
        <Text v="small" muted>{total !== undefined ? t('resultsCount', { n: total }) : ' '}</Text>
        {active.map((a) => (
          <Chip key={a.key} label={a.label} active onPress={a.clear} />
        ))}
      </Row>
      {right}
    </Row>
  );
}

/** Ro'yxat bo'sh bo'lganda: yuklanmoqda, xato yoki "topilmadi" (filtr bo'lsa — tozalash) */
export function CatalogEmpty({
  pending,
  error,
  onRetry,
  filtered,
  onReset,
  columns,
  cardWidth,
}: {
  pending: boolean;
  error: Error | null;
  onRetry: () => void;
  filtered: boolean;
  onReset: () => void;
  columns: number;
  cardWidth: number;
}) {
  const { t } = useI18n();
  if (pending) return <ProductGridSkeleton columns={columns} cardWidth={cardWidth} />;
  if (error) return <ErrorState error={error} onRetry={onRetry} />;
  return (
    <EmptyState
      icon="magnifying-glass"
      title={t('noProducts')}
      hint={t('noProductsHint')}
      action={filtered ? <Button title={t('clearFilters')} size="md" onPress={onReset} /> : null}
    />
  );
}
