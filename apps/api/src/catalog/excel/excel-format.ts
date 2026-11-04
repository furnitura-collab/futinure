/**
 * Katalog Excel formati. Bitta qator = bitta variant (SKU).
 * Bir xil product_code'li qatorlar bitta mahsulotning variantlari.
 *
 * Dinamik ustunlar:
 *   attr:<nom>        — variant xususiyati (attr:color, attr:thickness)
 *   group:<guruh>     — guruh narxi (group:Usta)
 *   tier<N>_qty/price — pog'onali narx (tier1_qty, tier1_price, ...)
 */
import { fromMilli, toMilli, UNITS, PRODUCT_KINDS, type Unit, type ProductKind } from '@mebel/shared';
import type ExcelJS from 'exceljs';

export const PRODUCT_COLUMNS = [
  'product_code',
  'category_slug',
  'brand',
  'name_uz',
  'name_ru',
  'unit',
  'kind',
  'min_qty',
  'qty_step',
  'weight_kg',
  'volume_m3',
  'board_length_mm',
  'board_width_mm',
  'thickness_mm',
] as const;

export const VARIANT_COLUMNS = ['sku', 'price', 'stock', 'low_stock', 'on_order', 'lead_time_days', 'active'] as const;

export const REQUIRED_COLUMNS = ['product_code', 'category_slug', 'name_uz', 'name_ru', 'unit', 'sku', 'price'] as const;

export const SHEET_NAME = 'Mahsulotlar';
export const MAX_ROWS = 10_000;

export const COLUMN_HELP: Record<string, string> = {
  product_code: 'Mahsulot kodi. Bir xil kodli qatorlar — bitta mahsulotning variantlari (majburiy)',
  category_slug: 'Kategoriya slug\'i, masalan: ldsp (majburiy)',
  brand: 'Brend nomi. Yo\'q bo\'lsa avtomatik yaratiladi',
  name_uz: 'Nomi o\'zbekcha (majburiy)',
  name_ru: 'Nomi ruscha (majburiy)',
  unit: `O'lchov birligi: ${UNITS.join(', ')} (majburiy)`,
  kind: `Turi: ${PRODUCT_KINDS.join(', ')}. BOARD — raspilga yaroqli plita`,
  min_qty: 'Minimal buyurtma miqdori (default 1)',
  qty_step: 'Miqdor qadami: 100 bo\'lsa faqat 100, 200, 300... (default 1)',
  weight_kg: '1 birlik og\'irligi, kg',
  volume_m3: '1 birlik hajmi, m³',
  board_length_mm: 'Plita uzunligi, mm (BOARD uchun majburiy)',
  board_width_mm: 'Plita eni, mm (BOARD uchun majburiy)',
  thickness_mm: 'Qalinligi, mm',
  sku: 'Artikul, takrorlanmas (majburiy)',
  price: 'Chakana narx, so\'m (majburiy)',
  stock: 'Haqiqiy qoldiq. Bo\'sh qoldirilsa o\'zgarmaydi. Farq bo\'lsa inventarizatsiya yozuvi yaratiladi',
  low_stock: 'Shu miqdordan kam qolsa ogohlantirish',
  on_order: 'Buyurtma asosida (ha/yo\'q): qoldiq yo\'q bo\'lsa ham buyurtma qabul qilinadi',
  lead_time_days: 'Buyurtma asosida bo\'lsa, necha kunda keladi',
  active: 'Sotuvda (ha/yo\'q), default ha',
  'attr:<nom>': 'Xususiyat: attr:color, attr:decor_code, attr:thickness va h.k.',
  'group:<guruh>': 'Guruh narxi: group:Usta, group:Diler. Bo\'sh — guruh narxi yo\'q',
  'tier<N>_qty / tier<N>_price': 'Pog\'onali narx: tier1_qty=10, tier1_price=385000 → 10 tadan boshlab shu narx',
};

// ───────────── Hujayra qiymatlarini o'qish ─────────────

export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('').trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text).trim();
  }
  return String(value).trim();
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = (error: string): Parsed<never> => ({ ok: false, error });

/** "395 000", "395,000" → 395000 */
export function parseMoney(s: string): Parsed<bigint> {
  const clean = s.replace(/[\s ]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^\d{1,13}$/.test(clean)) return fail('butun musbat son bo\'lishi kerak');
  return ok(BigInt(clean));
}

/** "12,5" ham qabul qilinadi. Normallashgan "12.5" qaytaradi */
export function parseQty(s: string): Parsed<string> {
  const milli = toMilli(s.replace(',', '.').replace(/\s/g, ''));
  return milli === null ? fail('son bo\'lishi kerak (maks 3 kasr xona)') : ok(fromMilli(milli));
}

export function parseInt0(s: string, max: number): Parsed<number> {
  if (!/^\d+$/.test(s)) return fail('butun son bo\'lishi kerak');
  const n = Number(s);
  return n > max ? fail(`${max} dan oshmasligi kerak`) : ok(n);
}

export function parseDecimal(s: string, maxFraction: number, max: number): Parsed<number> {
  const clean = s.replace(',', '.').replace(/\s/g, '');
  const re = new RegExp(`^\\d+(\\.\\d{1,${maxFraction}})?$`);
  if (!re.test(clean)) return fail(`son bo'lishi kerak (maks ${maxFraction} kasr xona)`);
  const n = Number(clean);
  return n > max ? fail(`${max} dan oshmasligi kerak`) : ok(n);
}

const TRUE = new Set(['ha', 'yes', 'true', '1', 'да', '+']);
const FALSE = new Set(['yo\'q', 'yoq', 'yo‘q', 'no', 'false', '0', 'нет', '-']);

export function parseBool(s: string): Parsed<boolean> {
  const v = s.toLowerCase();
  if (TRUE.has(v)) return ok(true);
  if (FALSE.has(v)) return ok(false);
  return fail('"ha" yoki "yo\'q" bo\'lishi kerak');
}

function parseEnum<T extends string>(s: string, values: readonly T[]): Parsed<T> {
  const v = s.toUpperCase() as T;
  return values.includes(v) ? ok(v) : fail(`quyidagilardan biri: ${values.join(', ')}`);
}

export const parseUnit = (s: string) => parseEnum<Unit>(s, UNITS);
export const parseKind = (s: string) => parseEnum<ProductKind>(s, PRODUCT_KINDS);

/**
 * Atribut qiymati: son bo'lsa son, aks holda matn.
 * Boshida nol bo'lgan kodlar ("0190" dekor kodi) matn bo'lib qoladi.
 */
export function attrValue(s: string): string | number {
  return /^-?(0|[1-9]\d*)([.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : s;
}

/** Kalitlar tartibidan qat'i nazar taqqoslash uchun */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
