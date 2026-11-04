import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { changePasswordSchema, PASSWORD_MIN } from '@mebel/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { FormField } from './FormField';

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');

  const reset = () => {
    setCurrent('');
    setNext('');
    setRepeat('');
  };
  const close = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
  const tooShort = next.length > 0 && next.length < PASSWORD_MIN;
  const mismatch = repeat.length > 0 && repeat !== next;
  const valid = parsed.success && current.length > 0 && next === repeat;

  const save = useApiMutation(() => api('/me/password', { body: { currentPassword: current, newPassword: next } }), {
    onSuccess: () => {
      toast.success(t('profile.passwordChanged'));
      close(false);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (valid) save.mutate(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>{t('profile.changePassword')}</DialogTitle>
            <DialogDescription>{t('profile.passwordHint')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="grid gap-4">
            <FormField label={t('profile.currentPassword')}>
              {(f) => <Input {...f} type="password" autoComplete="current-password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />}
            </FormField>
            <FormField
              label={t('profile.newPassword')}
              hint={t('profile.passwordTooShort', { min: PASSWORD_MIN })}
              error={tooShort ? t('profile.passwordTooShort', { min: PASSWORD_MIN }) : null}
            >
              {(f) => <Input {...f} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
            </FormField>
            <FormField label={t('profile.confirmPassword')} error={mismatch ? t('profile.passwordMismatch') : null}>
              {(f) => <Input {...f} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />}
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!valid}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
