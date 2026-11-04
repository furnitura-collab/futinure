import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { apiBlobUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

/**
 * Yopiq fayl (chek, chat ilovasi): token bilan yuklab, blob URL orqali ko'rsatadi.
 * PDF — yangi oynada ochiladigan havola.
 */
export function AuthFile({ path, mimeType, className }: { path: string; mimeType: string; className?: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;
    apiBlobUrl(path)
      .then((u) => {
        created = u;
        if (!revoked) setUrl(u);
      })
      .catch(() => setFailed(true));
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);

  if (failed) return <span className="text-xs text-destructive">{t('common.fileFailed')}</span>;
  if (!url) return <Skeleton className="h-32 w-full max-w-56 rounded-lg" />;
  if (mimeType === 'application/pdf') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <FileText className="size-4" /> {t('common.openPdf')}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img src={url} alt="" className={cn('max-h-64 animate-fade-up rounded-lg ring-1 ring-border', className)} />
    </a>
  );
}
