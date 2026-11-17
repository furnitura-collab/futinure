import { toast } from 'sonner';
import { IconButton } from '@/components/IconButton';
import { Copy } from '@/components/icons';
import { useI18n } from '@/i18n';

export function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const copy = () =>
    navigator.clipboard.writeText(value).then(
      () => toast.success(t('common.copied', { value })),
      () => toast.error(t('common.copyFailed')),
    );
  return <IconButton icon={Copy} label={label} size="icon-xs" onClick={() => void copy()} />;
}
