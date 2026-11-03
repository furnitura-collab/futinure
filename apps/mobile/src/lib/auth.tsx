import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokens, type Tokens } from './api';
import { useI18n } from './i18n';
import type { Me } from './types';

interface AuthState {
  /** Tokenlar xotiradan yuklanmoqda (ilova endi ochildi) */
  booting: boolean;
  me: Me | null;
  login: (t: Tokens) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { locale } = useI18n();
  const [booting, setBooting] = useState(true);
  const [hasTokens, setHasTokens] = useState(false);

  useEffect(() => {
    void tokens.load().then((t) => {
      setHasTokens(!!t);
      setBooting(false);
    });
    return tokens.subscribe((t) => {
      setHasTokens(!!t);
      if (!t) qc.clear();
    });
  }, [qc]);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/me'),
    enabled: hasTokens,
    staleTime: 60_000,
  });
  const me = hasTokens ? (meQuery.data ?? null) : null;

  // Server bildirishnomalarni shu tilda yuboradi — ilova tili bilan bir xil bo'lsin
  useEffect(() => {
    if (me && me.locale !== locale) {
      void api('/me', { method: 'PATCH', body: { locale } }).then(() => qc.invalidateQueries({ queryKey: ['me'] }));
    }
  }, [me, locale, qc]);

  const login = useCallback(
    async (t: Tokens) => {
      await tokens.set(t);
      await qc.invalidateQueries({ queryKey: ['me'] });
    },
    [qc],
  );

  const logout = useCallback(async () => {
    const t = tokens.get();
    if (t) await api('/auth/logout', { body: { refreshToken: t.refreshToken } }).catch(() => undefined);
    await tokens.set(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ booting: booting || (hasTokens && meQuery.isPending), me, login, logout }),
    [booting, hasTokens, meQuery.isPending, me, login, logout],
  );
  return <Ctx value={value}>{children}</Ctx>;
}

export function useAuth() {
  const c = use(Ctx);
  if (!c) throw new Error('AuthProvider kerak');
  return c;
}
