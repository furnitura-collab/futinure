import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { normalizeUzPhone } from '@mebel/shared';
import { api, ApiError, tokenStore, type Tokens } from '../lib/api';
import { PANEL_ROLES, useAuth } from '../lib/auth';
import type { Me } from '../lib/types';
import { Button, Field, Input } from '../components/ui';

export function LoginPage() {
  const { me, login } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me && PANEL_ROLES.includes(me.role)) return <Navigate to="/orders" replace />;

  const normalized = normalizeUzPhone(phone);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    if (!normalized) return setError('Telefon raqam noto\'g\'ri');
    setBusy(true);
    setError(null);
    try {
      await api('/auth/otp/request', { body: { phone: normalized } });
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'OTP_RATE_LIMIT' ? 'Juda ko\'p urinish. Birozdan keyin qayta urining' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<Tokens & { user: Me }>('/auth/otp/verify', { body: { phone: normalized, code } });
      if (!PANEL_ROLES.includes(res.user.role)) {
        // Mijoz yoki haydovchi — sessiyani darhol yopamiz
        await api('/auth/logout', { body: { refreshToken: res.refreshToken } }).catch(() => undefined);
        tokenStore.set(null);
        setError('Bu panel xodimlar uchun. Mijozlar mobil ilovadan foydalanadi');
        return;
      }
      login(res);
    } catch (err) {
      const e2 = err as ApiError;
      setError(
        e2.code === 'OTP_INVALID'
          ? `Kod noto'g'ri. Qolgan urinishlar: ${(e2.details as { attemptsLeft?: number })?.attemptsLeft ?? 0}`
          : e2.message,
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

        {step === 'phone' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <Field label="Telefon raqam" error={error}>
              {(id) => (
                <Input id={id} autoFocus inputMode="tel" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={busy} disabled={!normalized}>
              SMS kod olish
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <Field label={`Kod ${normalized} raqamiga yuborildi`} error={error}>
              {(id) => (
                <Input
                  id={id}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
              )}
            </Field>
            <Button type="submit" className="w-full" loading={busy} disabled={code.length < 4}>
              Kirish
            </Button>
            <button type="button" className="w-full text-sm text-stone-500 hover:text-stone-800" onClick={() => setStep('phone')}>
              Raqamni o'zgartirish
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
