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

/** Mijozga NEW — "ko'rib chiqilmoqda", QUOTED — "taklif keldi" (admin panelda boshqacha nomlanadi) */
const CUSTOMER_STATUS: Record<Locale, Partial<Record<OrderStatus, string>>> = {
  uz: { NEW: "Ko'rib chiqilmoqda", QUOTED: 'Taklif keldi' },
  ru: { NEW: 'На рассмотрении', QUOTED: 'Есть предложение' },
  en: { NEW: 'Under review', QUOTED: 'Quote received' },
};

const LOCALE_KEY = 'mebel.locale';
const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

/** Mijozlar O'zbekistonda: rus tilli qurilmada — ruscha, qolganida (inglizcha ham) — o'zbekcha */
function deviceLocale(): Locale {
  return getLocales()[0]?.languageCode === 'ru' ? 'ru' : 'uz';
}

/**
 * Ko'plik shakllari: matnda "|" bilan ajratiladi, tartibi — shu ro'yxat (CLDR).
 * Masalan en: "{n} product|{n} products", ru: "{n} товар|{n} товара|{n} товаров"
 */
const PLURAL_FORMS: Record<Locale, Intl.LDMLPluralRule[]> = { uz: ['other'], ru: ['one', 'few', 'many'], en: ['one', 'other'] };

function plural(text: string, n: unknown, locale: Locale): string {
  if (typeof n !== 'number' || !text.includes('|')) return text;
  const forms = text.split('|');
  const i = PLURAL_FORMS[locale].indexOf(new Intl.PluralRules(locale).select(n));
  return forms[i] ?? forms[forms.length - 1]!;
}

type Params = Record<string, string | number>;

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: Key, params?: Params) => string;
  money: (amount: number | null | undefined) => string;
  status: (s: OrderStatus) => string;
  /** Taklif qatorlarida birlik oddiy satr bo'lib keladi — noma'lum bo'lsa o'zi qaytadi */
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
