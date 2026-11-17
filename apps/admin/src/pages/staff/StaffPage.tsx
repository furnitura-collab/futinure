import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatDateTime, formatPhone, type Role } from '@mebel/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable, type Column } from '@/components/DataTable';
import { IconButton } from '@/components/IconButton';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput } from '@/components/SearchInput';
import { Toolbar } from '@/components/Toolbar';
import { KeyRound, Pencil, ShieldCheck, ShieldOff, UsersRound } from '@/components/icons';
import type { Tone } from '@/components/tone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useApiMutation } from '@/lib/mutation';
import type { StaffMember } from '@/lib/types';
import { ResetPasswordDialog } from './ResetPasswordDialog';
import { StaffSheet } from './StaffSheet';

const ROLE_TONE: Record<Role, Tone> = { SUPER_ADMIN: 'primary', MANAGER: 'info', WAREHOUSE: 'teal', DRIVER: 'violet', CUSTOMER: 'neutral' };

/** Xodimlar (faqat super admin): qo'shish, tahrirlash, bloklash, parolni tiklash */
export function StaffPage() {
  const { t, label } = useI18n();
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);
  const [resetting, setResetting] = useState<StaffMember | null>(null);
  const [blocking, setBlocking] = useState<StaffMember | null>(null);
  const { data, isPending, error, refetch } = useQuery({ queryKey: ['staff'], queryFn: () => api<StaffMember[]>('/admin/staff') });

  const setActive = useApiMutation(
    ({ id, isActive }: { id: string; isActive: boolean }) => api(`/admin/staff/${id}`, { method: 'PATCH', body: { isActive } }),
    {
      invalidate: [['staff']],
      onSuccess: () => setBlocking(null),
    },
  );
  const toggle = (m: StaffMember, isActive: boolean) =>
    setActive.mutate({ id: m.id, isActive }, { onSuccess: () => toast.success(isActive ? t('staff.activated') : t('staff.deactivated')) });

  const needle = q.trim().toLowerCase();
  const rows = data?.filter((m) => !needle || (m.fullName ?? '').toLowerCase().includes(needle) || m.phone.includes(needle.replace(/\D/g, '') || needle));

  const columns: Column<StaffMember>[] = [
    {
      id: 'name',
      header: t('staff.fullName'),
      sortValue: (m) => m.fullName ?? m.phone,
      cell: (m) => (
        <div className="flex min-w-40 items-center gap-2">
          <span className="font-medium">{m.fullName ?? '—'}</span>
          {m.id === me?.id && <Badge variant="outline">{t('staff.you')}</Badge>}
        </div>
      ),
    },
    { id: 'phone', header: t('staff.phone'), hideBelow: 'sm', cell: (m) => <span className="whitespace-nowrap tabular">{formatPhone(m.phone)}</span> },
    {
      id: 'role',
      header: t('staff.role'),
      sortValue: (m) => m.role,
      cell: (m) => <Badge variant={ROLE_TONE[m.role]}>{label('role', m.role)}</Badge>,
    },
    {
      id: 'status',
      header: t('common.status'),
      hideBelow: 'md',
      sortValue: (m) => Number(m.isActive),
      cell: (m) => <Badge variant={m.isActive ? 'success' : 'destructive'}>{m.isActive ? t('staff.active') : t('staff.blocked')}</Badge>,
    },
    {
      id: 'login',
      header: t('staff.lastLogin'),
      hideBelow: 'lg',
      sortValue: (m) => m.lastLoginAt,
      cell: (m) => <span className="whitespace-nowrap text-muted-foreground">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : t('staff.never')}</span>,
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('common.actions')}</span>,
      align: 'right',
      cell: (m) => (
        // Qator bosilsa (yoki Enter) tahrir ochiladi — tugmadagi bosish/Enter qatorga o'tmasin
        <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <IconButton icon={Pencil} label={t('common.edit')} onClick={() => setEditing(m)} />
          <IconButton icon={KeyRound} label={t('staff.resetPassword')} onClick={() => setResetting(m)} />
          {m.id !== me?.id &&
            (m.isActive ? (
              <IconButton icon={ShieldOff} label={t('staff.deactivate')} variant="ghost-destructive" onClick={() => setBlocking(m)} />
            ) : (
              <IconButton icon={ShieldCheck} label={t('staff.activate')} disabled={setActive.isPending} onClick={() => toggle(m, true)} />
            ))}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={t('staff.title')} description={t('staff.subtitle')}>
        <Button onClick={() => setEditing('new')}>
          {t('staff.add')}
        </Button>
      </PageHeader>
      <Toolbar className="mb-3">
        <SearchInput value={q} onChange={setQ} placeholder={t('staff.search')} />
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(m) => m.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={setEditing}
        rowClassName={(m) => !m.isActive && 'opacity-60'}
        empty={{ icon: UsersRound, title: t('staff.empty') }}
      />

      {editing && <StaffSheet member={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {resetting && <ResetPasswordDialog member={resetting} onClose={() => setResetting(null)} />}
      <ConfirmDialog
        open={!!blocking}
        onOpenChange={(o) => !o && setBlocking(null)}
        title={t('staff.deactivateTitle')}
        description={blocking && t('staff.deactivateText', { name: blocking.fullName ?? formatPhone(blocking.phone) })}
        confirmLabel={t('staff.deactivate')}
        destructive
        loading={setActive.isPending}
        onConfirm={() => blocking && toggle(blocking, false)}
      />
    </div>
  );
}
