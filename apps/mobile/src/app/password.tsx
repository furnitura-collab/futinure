import { router } from 'expo-router';
import { useState } from 'react';
import { changePasswordSchema, PASSWORD_MIN } from '@mebel/shared';
import { Button, Card, Input, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { space } from '@/theme';

export default function ChangePassword() {
  const { t, errorText } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [currentError, setCurrentError] = useState<string | null>(null);

  const body = { currentPassword: current || undefined, newPassword: next };
  const valid = changePasswordSchema.safeParse(body).success && next === confirm;
  const tooShort = next.length > 0 && next.length < PASSWORD_MIN;
  const mismatch = confirm.length > 0 && next !== confirm;

  const save = useApiMutation(() => api('/me/password', { body }), {
    success: t('passwordChanged'),
    onSuccess: () => router.back(),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_PASSWORD') {
        setCurrentError(errorText(e.code, e.message));
        return true;
      }
    },
  });

  return (
    <Screen width="form" modal title={t('changePassword')}>
      <Card style={{ gap: space(4) }}>
        <Input
          label={t('currentPassword')}
          hint={t('currentPasswordHint')}
          value={current}
          onChangeText={(v) => {
            setCurrent(v);
            setCurrentError(null);
          }}
          error={currentError}
          password
          autoComplete="current-password"
          autoCapitalize="none"
        />
        <Input
          label={t('newPassword')}
          value={next}
          onChangeText={setNext}
          error={tooShort ? t('passwordTooShort', { n: PASSWORD_MIN }) : null}
          password
          autoComplete="new-password"
          autoCapitalize="none"
        />
        <Input
          label={t('confirmPassword')}
          value={confirm}
          onChangeText={setConfirm}
          error={mismatch ? t('passwordMismatch') : null}
          password
          autoComplete="new-password"
          autoCapitalize="none"
          onSubmitEditing={() => valid && save.mutate(undefined)}
        />
        <Button title={t('save')} icon="checkmark" block disabled={!valid} loading={save.isPending} onPress={() => save.mutate(undefined)} />
      </Card>
    </Screen>
  );
}
