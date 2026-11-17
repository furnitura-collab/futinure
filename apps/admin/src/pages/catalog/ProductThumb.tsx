import { fileUrl } from '@/lib/api';

/** Rasm yo'q bo'lsa — "buzilgan rasm" emas, nomning bosh harfi bilan yumshoq plitka */
export function ProductThumb({ name, url }: { name: string; url?: string }) {
  if (url) return <img src={fileUrl(url)} alt="" loading="lazy" className="size-9 rounded-md object-cover ring-1 ring-border" />;
  return (
    <div aria-hidden className="flex size-9 items-center justify-center rounded-md bg-muted text-sm font-medium text-muted-foreground/70 select-none">
      {name.trim().charAt(0).toUpperCase() || '·'}
    </div>
  );
}
