import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

/** Fayl tashlash zonasi: sudrab tashlash yoki bosib tanlash; `accept` — input accept formatida */
export function DropZone({
  accept,
  multiple,
  disabled,
  onFiles,
  hint,
  className,
  children,
}: {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  hint?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (!disabled) take(e.dataTransfer.files);
  };
  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setOver(true);
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-input px-4 py-6 text-center text-sm transition-colors outline-none hover:border-primary/50 hover:bg-primary/4 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
          over && 'border-primary bg-primary/8 text-primary',
          className,
        )}
      >
        {children || <span className="font-medium">{over ? t('common.dropActive') : t('common.dropHere')}</span>}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </>
  );
}
