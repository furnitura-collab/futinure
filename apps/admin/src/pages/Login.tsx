import { Eye, EyeOff, LockKeyhole, Phone } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { formatUzPhoneInput, normalizeUzPhone, PASSWORD_MIN } from '@mebel/shared';
import { Callout } from '@/components/Callout';
import { FormField } from '@/components/FormField';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api, tokenStore, type Tokens } from '@/lib/api';
import { PANEL_ROLES, useAuth } from '@/lib/auth';
import type { Me } from '@/lib/types';

export function LoginPage() {
  const { t, errorText } = useI18n();
  const { me, login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me && PANEL_ROLES.includes(me.role)) return <Navigate to="/orders" replace />;

  const normalized = normalizeUzPhone(phone);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!normalized) return setError(t('auth.invalidPhone'));
    setBusy(true);
    setError(null);
    try {
      const res = await api<Tokens & { me: Me }>('/auth/login', { body: { phone: normalized, password, app: 'admin' } });
      if (!PANEL_ROLES.includes(res.me.role)) {
        // Server ham rad etadi (PANEL_FORBIDDEN); bu — eski server versiyasi uchun ikkinchi himoya
        await api('/auth/logout', { body: { refreshToken: res.refreshToken } }).catch(() => undefined);
        tokenStore.set(null);
        setError(t('auth.staffOnly'));
        return;
      }
      login(res);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center p-4">
      <div className="absolute top-3 right-3 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="glass w-full max-w-sm animate-fade-up rounded-2xl border p-6 shadow-xl shadow-black/5 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-10" />
          <p className="font-semibold">Mebel Order</p>
        </div>
        <h1 className="mb-6 text-xl font-semibold tracking-tight">{t('auth.subtitle')}</h1>

        <form onSubmit={submit} className="grid gap-4" noValidate>
          <FormField label={t('auth.phone')}>
            {(f) => (
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                {/* "+998" o'zgarmaydi — faqat 9 raqam yoziladi va "90 123 45 67" ko'rinishida guruhlanadi */}
                <span className="pointer-events-none absolute top-1/2 left-9 -translate-y-1/2 text-base">+998</span>
                <Input
                  {...f}
                  className="h-11 pl-[4.75rem] text-base md:text-base"
                  autoFocus
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="90 123 45 67"
                  value={phone}
                  onChange={(e) => setPhone(formatUzPhoneInput(e.target.value))}
                />
              </div>
            )}
          </FormField>
          <FormField label={t('auth.password')}>
            {(f) => (
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  {...f}
                  className="h-11 pr-11 pl-9 text-base md:text-base"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 size-9 -translate-y-1/2 text-muted-foreground"
                  aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            )}
          </FormField>
          {error && <Callout tone="destructive">{error}</Callout>}
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!normalized || password.length < PASSWORD_MIN}>
            {t('auth.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
