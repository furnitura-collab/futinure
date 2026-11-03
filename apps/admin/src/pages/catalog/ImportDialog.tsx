import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';
import { api, apiDownload } from '../../lib/api';
import { useApiMutation } from '../../lib/mutation';
import type { ImportResult } from '../../lib/types';
import { Button, Dialog } from '../../components/ui';

/**
 * Ikki bosqich: 1) tekshirish (dry-run) — nima o'zgarishini va xatolarni ko'rsatadi;
 * 2) xato bo'lmasa — o'sha faylni saqlash.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const run = useApiMutation(
    (commit: boolean) => {
      const form = new FormData();
      form.set('file', file!);
      return api<ImportResult>('/admin/catalog/import', { form, query: { commit } });
    },
    {
      invalidate: [['products'], ['brands']],
      onSuccess: (r) => setResult(r),
    },
  );

  const s = result?.summary;
  const nothing = s && !s.productsCreated && !s.productsUpdated && !s.variantsCreated && !s.variantsUpdated && !s.stockChanges;

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title="Excel'dan import"
      footer={
        result?.committed ? (
          <Button onClick={onClose}>Yopish</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Bekor</Button>
            {result && !result.errors.length && !nothing ? (
              <Button loading={run.isPending} onClick={() => run.mutate(true)}>Saqlash</Button>
            ) : (
              <Button loading={run.isPending} disabled={!file} onClick={() => run.mutate(false)}>Tekshirish</Button>
            )}
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-stone-300 p-4">
          <FileSpreadsheet className="size-8 text-emerald-600" />
          <div className="flex-1">
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="text-sm"
            />
            <p className="mt-1 text-xs text-stone-500">
              Format — eksport fayli bilan bir xil ("Yo'riqnoma" varag'ida har ustun tushuntirilgan). Bir qator = bitta SKU.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void apiDownload('/admin/catalog/export.xlsx', 'katalog-shablon.xlsx')}>
            <Download className="size-4" /> Joriy katalog
          </Button>
        </div>

        {result && (
          <>
            {result.committed ? (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
                <CheckCircle2 className="size-4" /> Saqlandi
              </p>
            ) : result.errors.length ? (
              <p className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
                <AlertTriangle className="size-4" /> {result.errors.length} ta xato — tuzatib, faylni qayta yuklang. Hech narsa saqlanmadi.
              </p>
            ) : nothing ? (
              <p className="rounded-lg bg-stone-50 p-3 text-sm text-stone-700">Fayl katalog bilan bir xil — o'zgarish yo'q.</p>
            ) : (
              <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900 ring-1 ring-sky-200">Xato yo'q. Natijani ko'rib, "Saqlash"ni bosing.</p>
            )}

            <dl className="grid grid-cols-3 gap-3 text-sm">
              {[
                ['Qatorlar', result.rows],
                ['Yangi mahsulot', s!.productsCreated],
                ['O\'zgargan mahsulot', s!.productsUpdated],
                ['Yangi variant', s!.variantsCreated],
                ['O\'zgargan variant', s!.variantsUpdated],
                ['Narxi o\'zgargan', s!.priceChanges],
                ['Qoldig\'i o\'zgargan', s!.stockChanges],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-stone-50 p-3">
                  <dt className="text-xs text-stone-500">{k}</dt>
                  <dd className="text-lg font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
            {!!s!.brandsCreated.length && <p className="text-sm">Yangi brendlar: {s!.brandsCreated.join(', ')}</p>}

            {[
              ['Xatolar', result.errors, 'text-rose-700'],
              ['Ogohlantirishlar', result.warnings, 'text-amber-700'],
            ].map(([title, list, tone]) =>
              (list as ImportResult['errors']).length ? (
                <div key={title as string}>
                  <h3 className="mb-1 text-sm font-semibold">{title as string}</h3>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-200">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-stone-100">
                        {(list as ImportResult['errors']).map((e, i) => (
                          <tr key={i}>
                            <td className="w-20 px-3 py-1.5 text-stone-500">{e.row}-qator</td>
                            <td className="w-40 px-3 py-1.5 font-mono text-xs">{e.column ?? ''}</td>
                            <td className={`px-3 py-1.5 ${tone as string}`}>{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null,
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
