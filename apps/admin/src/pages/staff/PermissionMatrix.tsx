import { Fragment } from 'react';
import type { EditableRole, Permission } from '@mebel/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { useI18n, type TKey } from '@/i18n';
import { cn } from '@/lib/utils';

export type Matrix = Record<EditableRole, Permission[]>;

// Bo'limlar tartibi — admin menyusi bilan bir xil
const GROUPS: { key: TKey; prefixes: string[] }[] = [
  { key: 'access.groups.orders', prefixes: ['orders.'] },
  { key: 'access.groups.payments', prefixes: ['payments.'] },
  { key: 'access.groups.catalog', prefixes: ['catalog.', 'prices.', 'stock.'] },
  { key: 'access.groups.customers', prefixes: ['customers.'] },
  { key: 'access.groups.staff', prefixes: ['staff.'] },
];

/** Ruxsat × rol jadvali: super admin ustuni doim belgilangan, qulflangan ruxsat boshqa rolga berilmaydi */
export function PermissionMatrix({
  permissions,
  roles,
  matrix,
  locked,
  onToggle,
}: {
  permissions: Permission[];
  roles: EditableRole[];
  matrix: Matrix;
  locked: Permission[];
  onToggle: (role: EditableRole, p: Permission, on: boolean) => void;
}) {
  const { t, label } = useI18n();
  const columns: (EditableRole | 'SUPER_ADMIN')[] = [...roles, 'SUPER_ADMIN'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium" />
            {columns.map((r) => (
              <th key={r} scope="col" className="w-24 px-2 py-2.5 text-center font-medium max-sm:w-12 max-sm:px-0.5 max-sm:text-[10px] max-sm:leading-tight sm:whitespace-nowrap">
                {label('role', r)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GROUPS.map((g) => {
            const rows = permissions.filter((p) => g.prefixes.some((x) => p.startsWith(x)));
            if (!rows.length) return null;
            return (
              <Fragment key={g.key}>
                <tr className="bg-muted/40">
                  <th colSpan={columns.length + 1} scope="colgroup" className="px-4 py-1.5 text-left text-xs font-semibold text-muted-foreground">
                    {t(g.key)}
                  </th>
                </tr>
                {rows.map((p) => {
                  const isLocked = locked.includes(p);
                  const name = t(`access.perm.${p}.name` as TKey);
                  return (
                    <tr key={p} className="border-b last:border-b-0">
                      <th scope="row" className="px-4 py-2.5 text-left font-normal max-sm:pr-1">
                        <p className="font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">{isLocked ? t('access.locked') : t(`access.perm.${p}.hint` as TKey)}</p>
                      </th>
                      {columns.map((r) => {
                        const fixed = r === 'SUPER_ADMIN' || isLocked;
                        const on = r === 'SUPER_ADMIN' || matrix[r].includes(p);
                        return (
                          <td key={r} className={cn('px-2 py-2.5 text-center max-sm:px-0.5', fixed && 'opacity-60')}>
                            <Checkbox
                              aria-label={`${label('role', r)}: ${name}`}
                              checked={on}
                              disabled={fixed}
                              onCheckedChange={(v) => r !== 'SUPER_ADMIN' && onToggle(r, p, v === true)}
                              className="pointer-coarse:size-5"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
