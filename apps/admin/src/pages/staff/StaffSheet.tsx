import { useState, type FormEvent } from 'react';
import { createStaffSchema, PASSWORD_MIN, STAFF_ROLES, updateStaffSchema, type CreateStaff, type Role, type UpdateStaff } from '@mebel/shared';
import { FormField } from '@/components/FormField';
import { OptionSelect } from '@/components/OptionSelect';
import { SwitchField } from '@/components/SwitchField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useI18n, type TKey } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import type { StaffMember } from '@/lib/types';

type Field = 'fullName' | 'phone' | 'role' | 'password';
const FIELD_ERROR: Record<Field, TKey> = {
  fullName: 'staff.nameTooShort',
  phone: 'auth.invalidPhone',
  role: 'common.choose',
  password: 'staff.passwordHint',
};
const isRole = (v: string): v is Role => (STAFF_ROLES as readonly string[]).includes(v);

/** Xodim qo'shish / tahrirlash. Tahrirda telefon o'zgarmaydi, parol — alohida "Parolni tiklash" orqali */
export function StaffSheet({ member, onClose }: { member: StaffMember | null; onClose: () => void }) {
  const { t, label } = useI18n();
  const { me } = useAuth();
  const self = member?.id === me?.id;
  const [fullName, setFullName] = useState(member?.fullName ?? '');
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [role, setRole] = useState<Role>(member?.role ?? 'MANAGER');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(member?.isActive ?? true);
  const [submitted, setSubmitted] = useState(false);

  const parsed = member
    ? updateStaffSchema.safeParse({ fullName, ...(!self && { role, isActive }) })
    : createStaffSchema.safeParse({ fullName, phone, role, password });
  const errors = new Set(parsed.success ? [] : parsed.error.issues.map((i) => String(i.path[0])));
  const errorFor = (f: Field) => (submitted && errors.has(f) ? t(FIELD_ERROR[f], { min: PASSWORD_MIN }) : null);

  const save = useApiMutation(
    (body: CreateStaff | UpdateStaff) => (member ? api(`/admin/staff/${member.id}`, { method: 'PATCH', body }) : api('/admin/staff', { body })),
    { invalidate: [['staff']], success: member ? t('common.saved') : t('staff.created'), onSuccess: onClose },
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (parsed.success) save.mutate(parsed.data);
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <form onSubmit={submit} className="flex h-full flex-col">
          <SheetHeader className="border-b p-5">
            <SheetTitle>{member ? t('staff.editTitle') : t('staff.createTitle')}</SheetTitle>
            <SheetDescription>{member ? (member.fullName ?? member.phone) : t('staff.createHint')}</SheetDescription>
          </SheetHeader>
          <div className="grid flex-1 content-start gap-4 overflow-y-auto p-5">
            <FormField label={t('staff.fullName')} error={errorFor('fullName')}>
              {(f) => <Input {...f} autoFocus autoComplete="off" value={fullName} onChange={(e) => setFullName(e.target.value)} />}
            </FormField>
            <FormField label={t('staff.phone')} error={errorFor('phone')}>
              {(f) => (
                <Input
                  {...f}
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="+998 90 123 45 67"
                  disabled={!!member}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              )}
            </FormField>
            <FormField label={t('staff.role')} error={errorFor('role')}>
              {(f) => (
                <OptionSelect
                  {...f}
                  value={role}
                  disabled={self}
                  onValueChange={(v) => isRole(v) && setRole(v)}
                  options={STAFF_ROLES.map((r) => ({ value: r, label: label('role', r) }))}
                />
              )}
            </FormField>
            {!member && (
              <FormField label={t('staff.password')} hint={t('staff.passwordHint', { min: PASSWORD_MIN })} error={errorFor('password')}>
                {(f) => <Input {...f} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
              </FormField>
            )}
            {member && !self && <SwitchField checked={isActive} onCheckedChange={setIsActive} label={isActive ? t('staff.active') : t('staff.blocked')} />}
          </div>
          <SheetFooter className="flex-row justify-end border-t p-4">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common.save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
