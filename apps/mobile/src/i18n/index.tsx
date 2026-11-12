import { getLocales } from 'expo-localization';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  apiErrorText,
  formatMoney,
  label,
  LABELS,
  LOCALES,
  type CustomerType,
  type DeliveryStatus,
  type Locale,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
  type PaymentTerms,
  type StockLevel,
  type Unit,
} from '@mebel/shared';
import { secureStorage } from '@/lib/storage';
import { en } from './en';
import { ru } from './ru';
import { uz, type Dict, type Key } from './uz';

export type { Key as I18nKey };

const DICTS: Record<Locale, Dict> = { uz, ru, en };

/** Til tanlash ro'yxati — har til o'z nomi bilan */
export const LANGUAGES: { value: Locale; label: string; short: string }[] = [
  { value: 'uz', label: "O'zbekcha", short: 'UZ' },
  { value: 'ru', label: 'Русский', short: 'RU' },
  { value: 'en', label: 'English', short: 'EN' },
];

/** Mijozga NEW — "ko'rib chiqilmoqda" (admin panelda boshqacha nomlanadi) */
const CUSTOMER_STATUS: Record<Locale, Partial<Record<OrderStatus, string>>> = {
  uz: { NEW: "Ko'rib chiqilmoqda" },
  ru: { NEW: 'На рассмотрении' },
  en: { NEW: 'Under review' },
};

const LOCALE_KEY = 'mebel.locale';
const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

/** Mijozlar O'zbekistonda: rus tilli qurilmada — ruscha, qolganida (inglizcha ham) — o'zbekcha */
function deviceLocale(): Locale {
  return getLocales()[0]?.languageCode === 'ru' ? 'ru' : 'uz';
}

/**
 * Ko'plik shakli tartib raqami — CLDR qoidalari (butun sonlar uchun).
 * Intl.PluralRules ishlatilmaydi: Android'dagi Hermes'da u yo'q — ilova til almashganda yiqilardi.
 *   en: 0 — one, 1 — other ("{n} product|{n} products")
 *   ru: 0 — one (1, 21), 1 — few (2–4, 22–24), 2 — many ("{n} товар|{n} товара|{n} товаров")
 */
export function pluralIndex(locale: Locale, n: number): number {
  const abs = Math.abs(Math.trunc(n));
  if (locale === 'en') return abs === 1 ? 0 : 1;
  if (locale === 'ru') {
    const mod10 = abs % 10;
    const mod100 = abs % 100;
    if (mod10 === 1 && mod100 !== 11) return 0;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1;
    return 2;
  }
  return 0;
}

function plural(text: string, n: unknown, locale: Locale): string {
  if (typeof n !== 'number' || !text.includes('|')) return text;
  const forms = text.split('|');
  return forms[pluralIndex(locale, n)] ?? forms[forms.length - 1]!;
}

type Params = Record<string, string | number>;

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Key, params?: Params) => string;
  money: (amount: number | null | undefined) => string;
  status: (s: OrderStatus) => string;
  /** Birlik ba'zan oddiy satr bo'lib keladi — noma'lum bo'lsa o'zi qaytadi */
  unit: (u: Unit | string) => string;
  terms: (t: PaymentTerms) => string;
  method: (m: PaymentMethod) => string;
  paymentStatus: (s: PaymentStatus) => string;
  level: (l: StockLevel) => string;
  deliveryStatus: (s: DeliveryStatus) => string;
  customerType: (c: CustomerType) => string;
  errorText: (code: string | undefined, fallback: string) => string;
  /** Katalog nomlari faqat uz/ru — inglizchada o'zbekchasi */
  name: (x: { nameUz: string | null; nameRu: string | null }) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(deviceLocale);

  useEffect(() => {
    void secureStorage.get(LOCALE_KEY).then((v) => {
      if (isLocale(v)) setLocaleState(v);
    });
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    void secureStorage.set(LOCALE_KEY, l);
  }, []);

  const value = useMemo<I18n>(() => {
    const dict = DICTS[locale];
    return {
      locale,
      setLocale,
      t: (key, params) => plural(dict[key], params?.n, locale).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? '')),
      money: (amount) => formatMoney(amount, locale),
      status: (s) => CUSTOMER_STATUS[locale][s] ?? label('orderStatus', s, locale),
      unit: (u) => (LABELS.unit[locale] as Record<string, string>)[u] ?? u,
      terms: (x) => label('paymentTerms', x, locale),
      method: (m) => label('paymentMethod', m, locale),
      paymentStatus: (s) => label('paymentStatus', s, locale),
      level: (l) => label('stockLevel', l, locale),
      deliveryStatus: (s) => label('deliveryStatus', s, locale),
      customerType: (c) => LABELS.customerType[locale][c],
      errorText: (code, fallback) => apiErrorText(code, locale, fallback),
      name: (x) => (locale === 'ru' ? x.nameRu : null) ?? x.nameUz ?? '',
    };
  }, [locale, setLocale]);

  return <Ctx value={value}>{children}</Ctx>;
}

export function useI18n() {
  const c = use(Ctx);
  if (!c) throw new Error('I18nProvider kerak');
  return c;
}
