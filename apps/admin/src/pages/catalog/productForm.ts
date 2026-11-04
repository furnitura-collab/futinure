import type { ProductKind, Unit } from '@mebel/shared';
import type { AdminProduct } from '@/lib/types';

export interface ProductForm {
  nameUz: string;
  nameRu: string;
  code: string;
  categoryId: string;
  brandId: string;
  unit: Unit;
  kind: ProductKind;
  minQty: string;
  qtyStep: string;
  weightKg: string;
  volumeM3: string;
  boardLengthMm: string;
  boardWidthMm: string;
  thicknessMm: string;
  descriptionUz: string;
  descriptionRu: string;
  isActive: boolean;
}

export type SetField = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => void;

export function toForm(p?: AdminProduct): ProductForm {
  return {
    nameUz: p?.nameUz ?? '',
    nameRu: p?.nameRu ?? '',
    code: p?.code ?? '',
    categoryId: p?.categoryId ?? '',
    brandId: p?.brandId ?? '',
    unit: p?.unit ?? 'PIECE',
    kind: p?.kind ?? 'GOODS',
    minQty: p?.minQty ?? '1',
    qtyStep: p?.qtyStep ?? '1',
    weightKg: p?.weightKg ?? '',
    volumeM3: p?.volumeM3 ?? '',
    boardLengthMm: p?.boardLengthMm?.toString() ?? '',
    boardWidthMm: p?.boardWidthMm?.toString() ?? '',
    thicknessMm: p?.thicknessMm ?? '',
    descriptionUz: p?.descriptionUz ?? '',
    descriptionRu: p?.descriptionRu ?? '',
    isActive: p?.isActive ?? true,
  };
}

const decimal = (s: string) => s.replace(',', '.');
const numOrNull = (s: string) => (s.trim() === '' ? null : Number(decimal(s)));

export function toPayload(f: ProductForm) {
  return {
    nameUz: f.nameUz.trim(),
    nameRu: f.nameRu.trim(),
    code: f.code.trim() || null,
    categoryId: f.categoryId,
    brandId: f.brandId || null,
    unit: f.unit,
    kind: f.kind,
    minQty: decimal(f.minQty),
    qtyStep: decimal(f.qtyStep),
    weightKg: f.weightKg.trim() ? decimal(f.weightKg) : null,
    volumeM3: numOrNull(f.volumeM3),
    boardLengthMm: numOrNull(f.boardLengthMm),
    boardWidthMm: numOrNull(f.boardWidthMm),
    thicknessMm: numOrNull(f.thicknessMm),
    descriptionUz: f.descriptionUz.trim() || null,
    descriptionRu: f.descriptionRu.trim() || null,
    isActive: f.isActive,
  };
}

export const isFormValid = (f: ProductForm) =>
  !!(f.nameUz.trim() && f.nameRu.trim() && f.categoryId && (f.kind !== 'BOARD' || (f.boardLengthMm && f.boardWidthMm)));
