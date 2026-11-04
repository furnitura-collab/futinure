import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { t, errorText } = useI18n();
  return (
    <div role="alert" className={cn('flex flex-col items-center gap-3 rounded-xl border border-destructive/25 bg-destructive/6 px-6 py-10 text-center', className)}>
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm font-medium">{errorText(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
