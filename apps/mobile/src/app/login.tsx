import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { formatUzPhoneInput, normalizeUzPhone, PASSWORD_MIN } from '@mebel/shared';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Button, Card, Icon, Input, Row, Screen, Text } from '@/components/ui';
import { AuthSplit, BrandIntro, useAuthSplit } from '@/components/web/AuthSplit';
import { useI18n } from '@/i18n';
import { api, ApiError, type Tokens } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { space } from '@/theme';

export default function Login() {
  const { t, errorText } = useI18n();
  const split = useAuthSplit();
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const normalized = normalizeUzPhone(phone);
  const ready = !!normalized && password.length >= PASSWORD_MIN;

  const submit = async () => {
    if (!normalized) return setError(t('invalidPhone'));
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await login(await api<Tokens>('/auth/login', { body: { phone: normalized, password } }));
    } catch (e) {
      setError(e instanceof ApiError ? errorText(e.code, e.message) : t('error'));
      setBusy(false);
    }
  };

  const form = (
    <Card style={{ gap: space(4), padding: space(6) }}>
      <Text v="h2">{t('loginWelcome')}</Text>
      <Input
        label={t('phone')}
        icon="call-outline"
        prefix="+998"
        placeholder="90 123 45 67"
        value={phone}
        onChangeText={(v) => setPhone(formatUzPhoneInput(v))}
        keyboardType="phone-pad"
        autoComplete="tel-national"
        textContentType="telephoneNumber"
        autoFocus
        onSubmitEditing={() => void submit()}
      />
      <Input
        label={t('password')}
        icon="lock-closed-outline"
        value={password}
        onChangeText={setPassword}
        password
        autoComplete="current-password"
        hint={t('passwordFieldHint', { n: PASSWORD_MIN })}
        textContentType="password"
        autoCapitalize="none"
        error={error}
        onSubmitEditing={() => void submit()}
      />
      <Button title={t('login')} onPress={() => void submit()} loading={busy} disabled={!ready} />
      <Row gap={space(2)} style={{ alignItems: 'flex-start' }}>
        <Icon name="information-circle-outline" size={18} tone="info" />
        <Text v="small" muted style={{ flex: 1 }}>{t('passwordHint')}</Text>
      </Row>
    </Card>
  );
  const language = (
    <View style={{ alignSelf: 'flex-end', width: 180 }}>
      <LanguageSwitch short />
    </View>
  );

  // Kompyuterda: chapda brend paneli, o'ngda forma
  if (split) {
    return (
      <AuthSplit title={t('login')}>
        {language}
        <Animated.View entering={FadeInDown.duration(250)}>{form}</Animated.View>
      </AuthSplit>
    );
  }

  return (
    <Screen width="form" title={t('login')} contentStyle={{ flexGrow: 1 }}>
      {language}

      <View style={{ flex: 1, justifyContent: 'center', gap: space(6), paddingBottom: space(8) }}>
      <Animated.View entering={FadeInDown.duration(250)}>
        <BrandIntro />
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(250).delay(80)}>
        {form}
      </Animated.View>
      </View>
    </Screen>
  );
}
