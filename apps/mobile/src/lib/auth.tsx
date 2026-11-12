import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { APP_ROLES } from '@mebel/shared';
import { api, ApiError, tokens, type Tokens } from './api';
import { useI18n } from '@/i18n';
import type { Me } from './types';

interface AuthState {
  /** Tokenlar xotiradan yuklanmoqda (ilova endi ochildi) */
  booting: boolean;
  me: Me | null;
  /** Kirish javobi: tokenlar va profil (alohida /me so'rovisiz) */
  login: (session: Tokens & { me: Me }) => Promise<void>;
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

  // Avval saqlangan xodim sessiyasi (tekshiruvdan oldingi versiyadan) — yopiladi: xodimlar admin paneldan ishlaydi
  useEffect(() => {
    if (me && !APP_ROLES.customer.includes(me.role)) void closeSession();
  }, [me]);

  // Server bildirishnomalarni shu tilda yuboradi — ilova tili bilan bir xil bo'lsin
  useEffect(() => {
    if (me && me.locale !== locale) {
      void api('/me', { method: 'PATCH', body: { locale } }).then(() => qc.invalidateQueries({ queryKey: ['me'] }));
    }
  }, [me, locale, qc]);

  const login = useCallback(
    async ({ me: profile, ...t }: Tokens & { me: Me }) => {
      // Server ham tekshiradi (app: 'customer'); bu — eski server versiyasi uchun ikkinchi himoya
      if (!APP_ROLES.customer.includes(profile.role)) {
        await api('/auth/logout', { body: { refreshToken: t.refreshToken } }).catch(() => undefined);
        throw new ApiError(403, 'USE_ADMIN_PANEL', 'Xodimlar admin paneldan kiradi');
      }
      qc.setQueryData(['me'], profile);
      await tokens.set({ accessToken: t.accessToken, refreshToken: t.refreshToken });
    },
    [qc],
  );

  const logout = useCallback(closeSession, []);

  const value = useMemo<AuthState>(
    () => ({ booting: booting || (hasTokens && meQuery.isPending), me, login, logout }),
    [booting, hasTokens, meQuery.isPending, me, login, logout],
  );
  return <Ctx value={value}>{children}</Ctx>;
}

async function closeSession() {
  const t = tokens.get();
  if (t) await api('/auth/logout', { body: { refreshToken: t.refreshToken } }).catch(() => undefined);
  await tokens.set(null);
}

export function useAuth() {
  const c = use(Ctx);
  if (!c) throw new Error('AuthProvider kerak');
  return c;
}
