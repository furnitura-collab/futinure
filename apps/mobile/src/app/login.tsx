import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizeUzPhone, PASSWORD_MIN } from '@mebel/shared';
import { Button, Input, Segmented, Text } from '../components/ui';
import { api, ApiError, type Tokens } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../lib/i18n';
import { contained, CONTENT } from '../lib/layout';
import { colors, space } from '../lib/theme';

export default function Login() {
  const { t, locale, setLocale } = useI18n();
  const { login } = useAuth();
  const [phone, setPhone] = useState('+998 ');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const normalized = normalizeUzPhone(phone);

  const submit = async () => {
    if (!normalized) return setError(t('invalidPhone'));
    setBusy(true);
    setError(null);
    try {
      await login(await api<Tokens>('/auth/login', { body: { phone: normalized, password } }));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      setError(code === 'INVALID_PASSWORD' ? t('invalidPassword') : code === 'LOGIN_RATE_LIMIT' ? t('tooManyRequests') : (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brandBg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: space(6) }}>
        <View style={{ position: 'absolute', top: space(4), right: space(6), width: 120 }}>
          <Segmented value={locale} onChange={setLocale} options={[{ value: 'uz', label: 'UZ' }, { value: 'ru', label: 'RU' }]} />
        </View>

        <View style={{ ...contained(CONTENT.form), alignItems: 'center', marginBottom: space(10), gap: space(2) }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Text v="title" color="#fff">M</Text>
          </View>
          <Text v="title">{t('loginTitle')}</Text>
          <Text muted>{t('loginSubtitle')}</Text>
        </View>

        <View style={{ ...contained(420), gap: space(4) }}>
          <Input
            label={t('phone')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoComplete="tel"
            autoFocus
          />
          <Input
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            autoCapitalize="none"
            error={error}
            onSubmitEditing={submit}
          />
          <Button title={t('login')} onPress={submit} loading={busy} disabled={!normalized || password.length < PASSWORD_MIN} />
          <Text muted v="caption" style={{ textAlign: 'center' }}>{t('passwordHint')}</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
