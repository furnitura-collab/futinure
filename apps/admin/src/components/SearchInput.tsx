import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { cn } from '@/lib/utils';

export function SearchInput({
  value,
  onChange,
  placeholder,
  loading,
  autoFocus,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  loading?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cn('relative w-full sm:w-72', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        autoFocus={autoFocus}
        aria-label={placeholder ?? t('common.search')}
        placeholder={placeholder ?? t('common.search')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {loading ? (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('common.clear')}
            className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )
      )}
    </div>
  );
}
