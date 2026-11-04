import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  apiErrorText,
  formatMoney,
  label as sharedLabel,
  LOCALES,
  type LabelGroup,
  type LABELS,
  type Locale,
} from '@mebel/shared';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Me } from '@/lib/types';
import { en } from './en';
import { ru } from './ru';
import type { Dictionary, TKey, TParams } from './types';
import { uz } from './uz';

export type { TKey } from './types';

const DICTIONARIES: Record<Locale, Dictionary> = { uz, ru, en };
const STORAGE_KEY = 'mebel.admin.locale';

/** Tilning o'z nomi — har qaysi tilda bir xil ko'rinadi */
export const LOCALE_NAMES: Record<Locale, string> = { uz: "O'zbekcha", ru: 'Русский', en: 'English' };

const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

function readStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

function lookup(dict: Dictionary, key: string): string {
  let node: unknown = dict;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === 'string' ? node : key;
}

function translate(dict: Dictionary, key: TKey, params?: TParams) {
  const text = lookup(dict, key);
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text;
}

type LabelValue<G extends LabelGroup> = keyof (typeof LABELS)[G]['uz'];

export interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TKey, params?: TParams) => string;
  label: <G extends LabelGroup>(group: G, value: LabelValue<G>) => string;
  money: (amount: number | null | undefined) => string;
  errorText: (err: unknown) => string;
}

function createI18n(locale: Locale, setLocale: (l: Locale) => void): I18n {
  const dict = DICTIONARIES[locale];
  const t = (key: TKey, params?: TParams) => translate(dict, key, params);
  return {
    locale,
    setLocale,
    t,
    label: (group, value) => sharedLabel(group, value, locale),
    money: (amount) => formatMoney(amount, locale),
    errorText: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
          return (err.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`).join('; ');
        }
        const local = (dict.errors as Record<string, string>)[err.code];
        return apiErrorText(err.code, locale, local ?? (err.message || t('errors.generic')));
      }
      if (err instanceof TypeError) return apiErrorText('NETWORK', locale, t('errors.generic'));
      return t('errors.generic');
    },
  };
}

const I18nContext = createContext<I18n | null>(null);

/**
 * Tanlangan til localStorage'da saqlanadi va profilga (PATCH /me) yoziladi —
 * push-bildirishnomalar ham shu tilda keladi. Saqlangan tanlov bo'lmasa — profil tili olinadi.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale() ?? 'uz');

  const syncProfile = useCallback(
    (l: Locale) => {
      void api<Me>('/me', { method: 'PATCH', body: { locale: l } })
        .then(() => qc.setQueryData<Me>(['me'], (prev) => (prev ? { ...prev, locale: l } : prev)))
        .catch(() => undefined);
    },
    [qc],
  );

  const setLocale = useCallback(
    (l: Locale) => {
      setLocaleState(l);
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        // xususiy rejim — faqat shu sessiya uchun
      }
      if (me && me.locale !== l) syncProfile(l);
    },
    [me, syncProfile],
  );

  useEffect(() => {
    if (!me) return;
    const stored = readStoredLocale();
    if (!stored) setLocaleState(isLocale(me.locale) ? me.locale : 'uz');
    else if (me.locale !== stored) syncProfile(stored);
    // faqat foydalanuvchi almashganda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo(() => createI18n(locale, setLocale), [locale, setLocale]);
  return <I18nContext value={value}>{children}</I18nContext>;
}

const fallback = createI18n('uz', () => undefined);

export function useI18n(): I18n {
  return use(I18nContext) ?? fallback;
}
