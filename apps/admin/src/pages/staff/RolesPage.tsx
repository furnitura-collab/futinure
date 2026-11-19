import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { EditableRole, Permission } from '@mebel/shared';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import { PermissionMatrix, type Matrix } from './PermissionMatrix';

interface AccessView {
  permissions: Permission[];
  roles: EditableRole[];
  matrix: Matrix;
  defaults: Matrix;
  superAdminOnly: Permission[];
}

const same = (a: Matrix, b: Matrix) => (Object.keys(a) as EditableRole[]).every((r) => [...a[r]].sort().join() === [...b[r]].sort().join());

/** Super admin: rollar ruxsatlari. O'zgarish saqlangach darhol kuchga kiradi (xodimlar menyusi keyingi yangilanishda) */
export function RolesPage() {
  const { t } = useI18n();
  const query = useQuery({ queryKey: ['access-roles'], queryFn: () => api<AccessView>('/admin/access/roles') });
  // Tahrirlanayotgan nusxa; null — serverdagi holat
  const [draft, setDraft] = useState<Matrix | null>(null);
  const save = useApiMutation((matrix: Matrix) => api<AccessView>('/admin/access/roles', { method: 'PUT', body: { matrix } }), {
    invalidate: [['access-roles'], ['me']],
    success: t('access.saved'),
    onSuccess: () => setDraft(null),
  });

  const header = <PageHeader title={t('access.title')} description={t('access.subtitle')} back={{ to: '/staff', label: t('staff.title') }} />;
  if (!query.data)
    return (
      <div className="space-y-4">
        {header}
        {query.error ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <Skeleton className="h-96 rounded-xl" />}
      </div>
    );

  const v = query.data;
  const matrix = draft ?? v.matrix;
  const dirty = !same(matrix, v.matrix);
  const toggle = (role: EditableRole, p: Permission, on: boolean) =>
    setDraft({ ...matrix, [role]: on ? [...matrix[role], p] : matrix[role].filter((x) => x !== p) });

  return (
    <div className="space-y-4 max-lg:pb-16">
      {header}
      <SectionCard
        flush
        title={t('access.superAdmin')}
        actions={
          <Button variant="ghost" size="sm" disabled={same(matrix, v.defaults)} onClick={() => setDraft(v.defaults)}>
            {t('access.reset')}
          </Button>
        }
      >
        <PermissionMatrix permissions={v.permissions} roles={v.roles} matrix={matrix} locked={v.superAdminOnly} onToggle={toggle} />
      </SectionCard>
      {/* Saqlash — o'zgarish bo'lsa, pastda yopishgan panel (telefonda tab bar ustida) */}
      {dirty && (
        <div className="glass sticky bottom-[calc(var(--tabbar)+0.5rem+var(--safe-bottom))] z-20 flex items-center justify-between gap-3 rounded-xl border p-2 pl-4 shadow-lg shadow-primary/10 lg:bottom-4">
          <p className="text-sm text-muted-foreground">{t('access.changed')}</p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate(matrix)}>
              {t('access.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
