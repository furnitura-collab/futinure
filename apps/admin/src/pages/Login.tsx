import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { normalizeUzPhone, PASSWORD_MIN } from '@mebel/shared';
import { api, ApiError, tokenStore, type Tokens } from '../lib/api';
import { PANEL_ROLES, useAuth } from '../lib/auth';
import type { Me } from '../lib/types';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { me, login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me && PANEL_ROLES.includes(me.role)) return <Navigate to="/orders" replace />;

  const normalized = normalizeUzPhone(phone);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!normalized) return setError('Telefon raqam noto\'g\'ri');
    setBusy(true);
    setError(null);
    try {
      const res = await api<Tokens & { user: Me }>('/auth/login', { body: { phone: normalized, password } });
      if (!PANEL_ROLES.includes(res.user.role)) {
        // Mijoz yoki haydovchi — sessiyani darhol yopamiz
        await api('/auth/logout', { body: { refreshToken: res.refreshToken } }).catch(() => undefined);
        tokenStore.set(null);
        setError('Bu panel xodimlar uchun. Mijozlar mobil ilovadan foydalanadi');
        return;
      }
      login(res);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      setError(
        code === 'INVALID_PASSWORD'
          ? 'Parol noto\'g\'ri'
          : code === 'LOGIN_RATE_LIMIT'
            ? 'Juda ko\'p urinish. Birozdan keyin qayta urining'
            : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-brand-50 to-stone-100 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl ring-1 ring-stone-200">
        <div className="mb-6 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-10" />
          <div>
            <h1 className="text-lg font-semibold">Mebel Order</h1>
            <p className="text-sm text-stone-500">Xodimlar paneli</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Telefon raqam">
            {(id) => (
              <Input id={id} autoFocus inputMode="tel" autoComplete="username" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
            )}
          </Field>
          <Field label="Parol" error={error}>
            {(id) => (
              <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            )}
          </Field>
          <Button type="submit" className="w-full" loading={busy} disabled={!normalized || password.length < PASSWORD_MIN}>
            Kirish
          </Button>
          <p className="text-center text-xs text-stone-500">Birinchi kirishda kiritilgan parol hisobingizga o'rnatiladi</p>
        </form>
      </div>
    </div>
  );
}
