import { Download, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { Callout } from '@/components/Callout';
import { FormDialog } from '@/components/FormDialog';
import { TONE_TEXT } from '@/components/tone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n, type TKey } from '@/i18n';
import { api, apiDownload } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { ImportIssue, ImportResult } from '@/lib/types';
import { cn } from '@/lib/utils';

const SUMMARY: [TKey, (r: ImportResult) => number][] = [
  ['import.rows', (r) => r.rows],
  ['import.productsCreated', (r) => r.summary.productsCreated],
  ['import.productsUpdated', (r) => r.summary.productsUpdated],
  ['import.variantsCreated', (r) => r.summary.variantsCreated],
  ['import.variantsUpdated', (r) => r.summary.variantsUpdated],
  ['import.priceChanges', (r) => r.summary.priceChanges],
  ['import.stockChanges', (r) => r.summary.stockChanges],
];

function IssueList({ title, issues, tone }: { title: string; issues: ImportIssue[]; tone: 'destructive' | 'warning' }) {
  const { t } = useI18n();
  if (!issues.length) return null;
  return (
    <div>
      <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
      <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border bg-card text-sm">
        {issues.map((e, i) => (
          <li key={i} className="flex flex-wrap gap-x-3 px-3 py-1.5">
            <span className="w-20 text-muted-foreground">{t('import.row', { n: e.row })}</span>
            {e.column && <span className="font-mono text-xs leading-5">{e.column}</span>}
            <span className={cn('flex-1', TONE_TEXT[tone])}>{e.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ikki bosqich: 1) tekshirish (dry-run) — nima o'zgarishini va xatolarni ko'rsatadi;
 * 2) xato bo'lmasa — o'sha faylni saqlash.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const run = useApiMutation(
    (commit: boolean) => {
      const form = new FormData();
      if (file) form.set('file', file);
      return api<ImportResult>('/admin/catalog/import', { form, query: { commit } });
    },
    { invalidate: [['products'], ['brands']], onSuccess: setResult },
  );

  const s = result?.summary;
  const nothing = s && !s.productsCreated && !s.productsUpdated && !s.variantsCreated && !s.variantsUpdated && !s.stockChanges;

  return (
    <FormDialog
      size="lg"
      onClose={onClose}
      title={t('import.title')}
      footer={
        result?.committed ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            {result && !result.errors.length && !nothing ? (
              <Button loading={run.isPending} onClick={() => run.mutate(true)}>
                {t('common.save')}
              </Button>
            ) : (
              <Button loading={run.isPending} disabled={!file} onClick={() => run.mutate(false)}>
                {t('import.check')}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 sm:flex-row sm:items-center">
          <FileSpreadsheet className="size-8 shrink-0 text-success" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Input
              type="file"
              accept=".xlsx"
              aria-label={t('import.chooseFile')}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
            />
            <p className="text-xs text-muted-foreground">{t('import.formatHint')}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void apiDownload('/admin/catalog/export.xlsx', t('import.templateFile'))}>
            <Download /> {t('import.currentCatalog')}
          </Button>
        </div>

        {result && s && (
          <div className="grid animate-fade-up gap-4">
            {result.committed ? (
              <Callout tone="success">{t('import.saved')}</Callout>
            ) : result.errors.length ? (
              <Callout tone="destructive">{t('import.errorsFound', { n: result.errors.length })}</Callout>
            ) : nothing ? (
              <Callout tone="info">{t('import.noChanges')}</Callout>
            ) : (
              <Callout tone="info">{t('import.ready')}</Callout>
            )}

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {SUMMARY.map(([key, get]) => (
                <div key={key} className="rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs text-muted-foreground">{t(key)}</dt>
                  <dd className="text-lg font-semibold tabular">{get(result)}</dd>
                </div>
              ))}
            </dl>
            {!!s.brandsCreated.length && <p className="text-sm">{t('import.newBrands', { list: s.brandsCreated.join(', ') })}</p>}

            <IssueList title={t('import.errors')} issues={result.errors} tone="destructive" />
            <IssueList title={t('import.warnings')} issues={result.warnings} tone="warning" />
          </div>
        )}
      </div>
    </FormDialog>
  );
}
