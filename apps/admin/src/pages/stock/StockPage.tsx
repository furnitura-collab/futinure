import { useQuery } from '@tanstack/react-query';
import { PackagePlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Unit } from '@mebel/shared';
import { api } from '../../lib/api';
import { UNIT } from '../../lib/labels';
import type { AdminProduct, LowStockRow } from '../../lib/types';
import { Button, Card, cx, Empty, ErrorBox, PageHeader, PageLoader } from '../../components/ui';
import { VariantPicker, type PickedVariant } from '../orders/VariantPicker';
import { StockDialog } from './StockDialog';

interface Target {
  id: string;
  stockQty: string;
  reservedQty: string;
  unit: Unit;
  title: string;
}

/** Ombor: kam qolganlar va istalgan tovarga kirim/inventarizatsiya. Omborchi ham ishlatadi */
export function StockPage() {
  const low = useQuery({ queryKey: ['stock-low'], queryFn: () => api<LowStockRow[]>('/admin/stock/low') });
  const [target, setTarget] = useState<Target | null>(null);

  // Aniq qoldiq (fizik va band) uchun mahsulotni yuklaymiz — picker faqat mavjudni beradi
  const fromPicker = async (v: PickedVariant) => {
    const product = await api<AdminProduct>(`/admin/products/${v.productId}`);
    const exact = product.variants.find((x) => x.id === v.variantId)!;
    setTarget({ id: v.variantId, stockQty: exact.stockQty, reservedQty: exact.reservedQty, unit: v.unit, title: `${v.name} · ${v.sku}` });
  };

  return (
    <div>
      <PageHeader title="Ombor" />
      <div className="grid gap-6 p-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Kam qolgan tovarlar">
          {low.isPending ? (
            <PageLoader />
          ) : low.error ? (
            <ErrorBox error={low.error} />
          ) : low.data.length === 0 ? (
            <Empty>Hamma tovar yetarli</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-stone-500">
                <tr>
                  <th className="pb-2">Tovar</th>
                  <th className="pb-2 text-right">Mavjud</th>
                  <th className="pb-2 text-right">Band</th>
                  <th className="pb-2 text-right">Chegara</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {low.data.map((r) => (
                  <tr key={r.variant_id}>
                    <td className="py-2">
                      <Link to={`/catalog/${r.product_id}`} className="font-medium hover:underline">{r.name_uz}</Link>
                      <p className="font-mono text-xs text-stone-500">{r.sku}{r.on_order && ' · buyurtma asosida'}</p>
                    </td>
                    <td className={cx('py-2 text-right font-medium', Number(r.available_qty) <= 0 ? 'text-rose-600' : 'text-amber-700')}>
                      {r.available_qty} {UNIT[r.unit]}
                    </td>
                    <td className="py-2 text-right text-stone-500">{r.reserved_qty}</td>
                    <td className="py-2 text-right text-stone-500">{r.low_stock_threshold}</td>
                    <td className="py-2 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setTarget({ id: r.variant_id, stockQty: r.stock_qty, reservedQty: r.reserved_qty, unit: r.unit, title: `${r.name_uz} · ${r.sku}` })
                        }
                      >
                        <PackagePlus className="size-4" /> Kirim
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Kirim / inventarizatsiya">
          <p className="mb-3 text-sm text-stone-500">Istalgan tovarni toping:</p>
          <VariantPicker onPick={(v) => void fromPicker(v)} />
        </Card>
      </div>
      {target && (
        <StockDialog variant={{ id: target.id, stockQty: target.stockQty, reservedQty: target.reservedQty }} unit={target.unit} title={target.title} onClose={() => setTarget(null)} />
      )}
    </div>
  );
}
