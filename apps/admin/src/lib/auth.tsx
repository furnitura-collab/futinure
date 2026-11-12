import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_ROLES, type Role } from '@mebel/shared';
import { api, tokenStore, type Tokens } from './api';
import type { Me } from './types';

/** Admin panelga kira oladigan rollar (server bilan bir ro'yxat). Haydovchi mobil ilovadan ishlaydi */
export const PANEL_ROLES = APP_ROLES.admin;

interface AuthState {
  me: Me | null;
  loading: boolean;
  /** Kirish javobi: tokenlar va profil (alohida /me so'rovisiz) */
  login: (session: Tokens & { me: Me }) => void;
  logout: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [hasTokens, setHasTokens] = useState(() => !!tokenStore.get());

  useEffect(
    () =>
      tokenStore.subscribe((t) => {
        setHasTokens(!!t);
        if (!t) qc.clear();
      }),
    [qc],
  );

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/me'),
    enabled: hasTokens,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const login = useCallback(
    ({ me: profile, accessToken, refreshToken }: Tokens & { me: Me }) => {
      qc.setQueryData(['me'], profile);
      tokenStore.set({ accessToken, refreshToken });
    },
    [qc],
  );

  const logout = useCallback(async () => {
    const t = tokenStore.get();
    if (t) await api('/auth/logout', { body: { refreshToken: t.refreshToken } }).catch(() => undefined);
    tokenStore.set(null);
  }, []);

  const me = hasTokens ? (meQuery.data ?? null) : null;
  const value = useMemo<AuthState>(
    () => ({
      me,
      loading: hasTokens && meQuery.isPending,
      login,
      logout,
      can: (...roles) => !!me && roles.includes(me.role),
    }),
    [me, hasTokens, meQuery.isPending, login, logout],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatiladi');
  return ctx;
}
