import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { normalizeUzPhone } from '@mebel/shared';
import { Button, Input, Row, Segmented, Text } from '../components/ui';
import { api, ApiError, type Tokens } from '../lib/api';
import { useAuth } from '../lib/auth';
import { phone as fmtPhone } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { colors, space } from '../lib/theme';

export default function Login() {
  const { t, locale, setLocale } = useI18n();
  const { login } = useAuth();
  const [phone, setPhone] = useState('+998 ');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const normalized = normalizeUzPhone(phone);

  const requestCode = async () => {
    if (!normalized) return setError(t('invalidPhone'));
    setBusy(true);
    setError(null);
    try {
      await api('/auth/otp/request', { body: { phone: normalized } });
      setStep('code');
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'OTP_RATE_LIMIT' ? t('tooManyRequests') : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(await api<Tokens>('/auth/otp/verify', { body: { phone: normalized, code } }));
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'OTP_INVALID' ? t('invalidCode') : (e as Error).message);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.brandBg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: space(6) }}>
        <View style={{ position: 'absolute', top: space(4), right: space(6), width: 120 }}>
          <Segmented value={locale} onChange={setLocale} options={[{ value: 'uz', label: 'UZ' }, { value: 'ru', label: 'RU' }]} />
        </View>

        <View style={{ alignItems: 'center', marginBottom: space(10), gap: space(2) }}>
          <View style={{ width: 72, height: 72, borderRadius: 20, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Text v="title" color="#fff">M</Text>
          </View>
          <Text v="title">{t('loginTitle')}</Text>
          <Text muted>{t('loginSubtitle')}</Text>
        </View>

        {step === 'phone' ? (
          <View style={{ gap: space(4) }}>
            <Input
              label={t('phone')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              autoFocus
              error={error}
              onSubmitEditing={requestCode}
            />
            <Button title={t('getCode')} onPress={requestCode} loading={busy} disabled={!normalized} />
          </View>
        ) : (
          <View style={{ gap: space(4) }}>
            <Text muted>
              {t('codeSentTo')} {fmtPhone(normalized!)}
            </Text>
            <Input
              label={t('code')}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="sms-otp"
              textContentType="oneTimeCode"
              autoFocus
              maxLength={6}
              error={error}
              style={{ fontSize: 22, letterSpacing: 8, textAlign: 'center' }}
              onSubmitEditing={verify}
            />
            <Button title={t('login')} onPress={verify} loading={busy} disabled={code.length < 4} />
            <Row style={{ justifyContent: 'center' }}>
              <Pressable onPress={() => setStep('phone')}>
                <Text color={colors.brand}>{t('changePhone')}</Text>
              </Pressable>
            </Row>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
