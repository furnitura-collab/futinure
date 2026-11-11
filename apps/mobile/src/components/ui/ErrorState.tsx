import { ApiError } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorText } = useI18n();
  const message = error instanceof ApiError ? errorText(error.code, error.message) : error instanceof Error ? error.message : undefined;
  return (
    <EmptyState
      icon={error instanceof ApiError && error.code === 'NETWORK' ? 'cloud-offline-outline' : 'alert-circle-outline'}
      title={t('errorTitle')}
      hint={message}
      action={onRetry ? <Button title={t('retry')} variant="outline" size="md" onPress={onRetry} /> : null}
    />
  );
}
