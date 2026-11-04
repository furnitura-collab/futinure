import { useMemo, useState } from 'react';
import { lineTotal, resolveUnitPrice, validateQty } from '@mebel/shared';
import { useI18n } from '@/i18n';
import { useAddToCart, useCart } from '@/lib/cart';
import type { ProductDetail } from '@/lib/types';

/** Variant tanlash, miqdor, narx va savatga qo'shish — mahsulot sahifasi va tez qo'shish oynasi uchun umumiy */
export function useProductPurchase(p: ProductDetail | undefined) {
  const { name, unit } = useI18n();
  const cart = useCart();
  const add = useAddToCart();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState<string | null>(null);

  // Standart: omborda bor variant, bo'lmasa — buyurtma qilsa bo'ladigani
  const v =
    p?.variants.find((x) => x.id === variantId) ??
    p?.variants.find((x) => x.stockLevel === 'IN_STOCK') ??
    p?.variants.find((x) => x.stockLevel !== 'OUT_OF_STOCK') ??
    p?.variants[0];
  const inCart = cart.data?.lines.find((l) => l.variantId === v?.id);
  const quantity = qty ?? inCart?.qty ?? p?.minQty ?? '1';

  // Narx ekranda hisoblanadi (server bilan bir xil qoida — @mebel/shared)
  const price = useMemo(() => {
    if (!p || !v) return null;
    const check = validateQty(quantity, { minQty: p.minQty, qtyStep: p.qtyStep });
    const unitPrice = resolveUnitPrice({ basePrice: v.basePrice, tiers: v.tiers, groupPrice: v.groupPrice }, quantity).unitPrice;
    return { ok: check.ok, unitPrice, total: check.ok ? lineTotal(quantity, unitPrice) : 0 };
  }, [v, quantity, p]);

  return {
    variant: v,
    inCart,
    quantity,
    setQty,
    price,
    orderable: !!v && v.stockLevel !== 'OUT_OF_STOCK',
    pending: add.isPending,
    select: (id: string) => {
      setVariantId(id);
      setQty(null);
    },
    submit: (onDone?: () => void) => {
      if (!p || !v) return;
      add.mutate({ variantId: v.id, qty: quantity, label: `${name(p)} — ${quantity} ${unit(p.unit)}` }, { onSuccess: onDone });
    },
  };
}

export type ProductPurchase = ReturnType<typeof useProductPurchase>;
