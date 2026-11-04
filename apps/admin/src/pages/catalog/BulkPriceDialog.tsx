import { useState } from 'react';
import { ROUND_TO } from '@mebel/shared';
import { Callout } from '@/components/Callout';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { OptionSelect } from '@/components/OptionSelect';
import { SwitchField } from '@/components/SwitchField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { flattenCategories, useBrands, useCategories } from '@/lib/catalog';
import { useApiMutation } from '@/lib/mutation';

interface BulkResult {
  dryRun: boolean;
  summary: { percent: number; variantCount: number; oldTotal: number; newTotal: number };
  preview: { variantId: string; sku: string; name: string; oldPrice: number; newPrice: number }[];
}

/** Masalan dollar kursi oshganda: kategoriya/brend narxini +5%, 1000 so'mga yaxlitlab */
export function BulkPriceDialog({ onClose }: { onClose: () => void }) {
  const { t, money } = useI18n();
  const categories = useCategories();
  const brands = useBrands();
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [percent, setPercent] = useState('5');
  const [roundTo, setRoundTo] = useState<number>(1000);
  const [includeTiers, setIncludeTiers] = useState(true);
  const [includeGroupPrices, setIncludeGroupPrices] = useState(true);
  const [result, setResult] = useState<BulkResult | null>(null);

  const p = Number(percent.replace(',', '.'));
  const valid = (categoryId || brandId) && Number.isFinite(p) && p !== 0 && p >= -50 && p <= 200;

  const run = useApiMutation(
    (dryRun: boolean) =>
      api<BulkResult>('/admin/prices/bulk-update', {
        body: { categoryId: categoryId || undefined, brandId: brandId || undefined, percent: p, roundTo, includeTiers, includeGroupPrices, dryRun },
      }),
    { invalidate: [['products']], onSuccess: setResult },
  );
  // Parametr o'zgarsa — oldingi ko'rinish eskirgan
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setResult(null);
    };

  const applied = result && !result.dryRun;
  const summary = result && {
    n: result.summary.variantCount,
    percent: `${result.summary.percent > 0 ? '+' : ''}${result.summary.percent}`,
  };

  return (
    <FormDialog
      size="lg"
      onClose={onClose}
      title={t('bulk.title')}
      description={t('bulk.hint')}
      footer={
        applied ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            {result ? (
              <Button variant="destructive" loading={run.isPending} onClick={() => run.mutate(false)}>
                {t('bulk.apply', { n: result.summary.variantCount })}
              </Button>
            ) : (
              <Button loading={run.isPending} disabled={!valid} onClick={() => run.mutate(true)}>
                {t('bulk.preview')}
              </Button>
            )}
          </>
        )
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('catalog.category')}>
            {(f) => (
              <OptionSelect
                {...f}
                value={categoryId}
                onValueChange={change(setCategoryId)}
                emptyLabel="—"
                options={flattenCategories(categories.data ?? []).map((c) => ({ value: c.id, label: c.label }))}
              />
            )}
          </FormField>
          <FormField label={t('product.brand')}>
            {(f) => (
              <OptionSelect
                {...f}
                value={brandId}
                onValueChange={change(setBrandId)}
                emptyLabel="—"
                options={(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))}
              />
            )}
          </FormField>
          <FormField label={t('bulk.percent')}>
            {(f) => <Input {...f} inputMode="decimal" value={percent} onChange={(e) => change(setPercent)(e.target.value)} />}
          </FormField>
          <FormField label={t('bulk.rounding')}>
            {(f) => (
              <OptionSelect
                {...f}
                value={String(roundTo)}
                onValueChange={(v) => change(setRoundTo)(Number(v))}
                options={ROUND_TO.map((r) => ({ value: String(r), label: r === 1 ? t('bulk.noRounding') : t('bulk.roundTo', { amount: money(r) }) }))}
              />
            )}
          </FormField>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <SwitchField checked={includeTiers} onCheckedChange={change(setIncludeTiers)} label={t('bulk.includeTiers')} />
          <SwitchField checked={includeGroupPrices} onCheckedChange={change(setIncludeGroupPrices)} label={t('bulk.includeGroups')} />
        </div>

        {result && summary && (
          <div className="grid animate-fade-up gap-3">
            <Callout tone={applied ? 'success' : 'warning'}>{applied ? t('bulk.applied', summary) : t('bulk.previewText', summary)}</Callout>
            <div className="max-h-72 overflow-y-auto rounded-lg border bg-card">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-3 text-xs text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-xs text-muted-foreground">{t('bulk.name')}</TableHead>
                    <TableHead className="text-right text-xs text-muted-foreground">{t('bulk.current')}</TableHead>
                    <TableHead className="px-3 text-right text-xs text-muted-foreground">{t('bulk.next')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.preview.map((r) => (
                    <TableRow key={r.variantId}>
                      <TableCell className="px-3 font-mono text-xs">{r.sku}</TableCell>
                      <TableCell className="whitespace-normal">{r.name}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular">{money(r.oldPrice)}</TableCell>
                      <TableCell className="px-3 text-right font-medium tabular">{money(r.newPrice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </FormDialog>
  );
}
