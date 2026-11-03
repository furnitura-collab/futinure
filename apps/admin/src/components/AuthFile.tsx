import { FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiBlobUrl } from '../lib/api';
import { Spinner } from './ui';

/**
 * Yopiq fayl (chek, chat ilovasi): token bilan yuklab, blob URL orqali ko'rsatadi.
 * PDF — yangi oynada ochiladigan havola.
 */
export function AuthFile({ path, mimeType, className }: { path: string; mimeType: string; className?: string }) {
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

  if (failed) return <span className="text-xs text-rose-600">Fayl ochilmadi</span>;
  if (!url) return <Spinner />;
  if (mimeType === 'application/pdf') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">
        <FileText className="size-4" /> PDF ochish
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="" className={className ?? 'max-h-64 rounded-lg ring-1 ring-stone-200'} />
    </a>
  );
}
