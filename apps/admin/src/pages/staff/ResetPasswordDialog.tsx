import { useState } from 'react';
import { PASSWORD_MIN } from '@mebel/shared';
import { FormDialog } from '@/components/FormDialog';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { StaffMember } from '@/lib/types';

export function ResetPasswordDialog({ member, onClose }: { member: StaffMember; onClose: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const save = useApiMutation(() => api(`/admin/staff/${member.id}`, { method: 'PATCH', body: { password } }), {
    invalidate: [['staff']],
    success: t('staff.resetDone'),
    onSuccess: onClose,
  });
  const tooShort = password.length > 0 && password.length < PASSWORD_MIN;
  return (
    <FormDialog
      onClose={onClose}
      title={t('staff.resetTitle', { name: member.fullName ?? member.phone })}
      description={t('staff.resetHint')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={password.length < PASSWORD_MIN} onClick={() => save.mutate(undefined)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <FormField
        label={t('profile.newPassword')}
        hint={t('staff.passwordHint', { min: PASSWORD_MIN })}
        error={tooShort ? t('staff.passwordHint', { min: PASSWORD_MIN }) : null}
      >
        {(f) => <Input {...f} type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />}
      </FormField>
    </FormDialog>
  );
}
