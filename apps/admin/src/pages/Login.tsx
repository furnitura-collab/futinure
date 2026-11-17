import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { formatUzPhoneInput, normalizeUzPhone, PASSWORD_MIN } from '@mebel/shared';
import { Callout } from '@/components/Callout';
import { FormField } from '@/components/FormField';
import { IconButton } from '@/components/IconButton';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Eye, EyeOff } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api, tokenStore, type Tokens } from '@/lib/api';
import { PANEL_ROLES, useAuth } from '@/lib/auth';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

// Telefonda kattaroq maydon (barmoq va o'qish uchun); 16px shrift — iOS/WebView fokusda sahifani kattalashtirmaydi
const FIELD = 'h-12 text-base sm:h-10 md:text-base';

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
    // Klaviatura ochilganda ko'rinadigan balandlik kichrayadi: markazlash `my-auto` bilan — karta tepasi kesilmaydi, sahifa aylanadi
    <div className="relative flex min-h-dvh flex-col items-center px-4 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] right-3 flex items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <div className="glass my-auto w-full max-w-sm animate-fade-up rounded-2xl border border-primary/15 p-5 shadow-2xl shadow-primary/15 sm:p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-9 rounded-lg" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">Mebel Order</p>
            <h1 className="text-xs text-muted-foreground">{t('auth.subtitle')}</h1>
          </div>
        </div>

        <form onSubmit={submit} className="grid gap-3.5" noValidate>
          <FormField label={t('auth.phone')}>
            {(f) => (
              <div className="relative">
                {/* "+998" o'zgarmaydi — faqat 9 raqam yoziladi va "90 123 45 67" ko'rinishida guruhlanadi */}
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-muted-foreground">+998</span>
                <Input
                  {...f}
                  className={cn(FIELD, 'pl-[3.6rem]')}
                  autoFocus
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  enterKeyHint="next"
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
                <Input
                  {...f}
                  className={cn(FIELD, 'pr-11')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="go"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <IconButton
                  icon={showPassword ? EyeOff : Eye}
                  label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                />
              </div>
            )}
          </FormField>
          {error && <Callout tone="destructive">{error}</Callout>}
          <Button type="submit" className="mt-1 h-12 w-full text-base sm:h-10 sm:text-sm" loading={busy} disabled={!normalized || password.length < PASSWORD_MIN}>
            {t('auth.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
