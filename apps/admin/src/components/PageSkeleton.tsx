import { Skeleton } from '@/components/ui/skeleton';

/** Sahifa yuklanayotganda — tuzilishi o'xshash "skelet" (spinner o'rniga) */
export function PageSkeleton({ cards = 0 }: { cards?: number }) {
  return (
    <div aria-busy className="animate-fade-up space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {cards > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: cards }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
