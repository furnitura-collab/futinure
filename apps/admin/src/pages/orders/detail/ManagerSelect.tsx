import { useQuery } from '@tanstack/react-query';
import { formatPhone } from '@mebel/shared';
import { OptionSelect } from '@/components/OptionSelect';
import { useI18n } from '@/i18n';
import { api } from '@/lib/api';
import { useApiMutation } from '@/lib/mutation';
import type { Manager, OrderDetail } from '@/lib/types';

/** Mas'ul menejer — buyurtma xususiyati, bosqichlar qatorida */
export function ManagerSelect({ order }: { order: OrderDetail }) {
  const { t } = useI18n();
  const { data: managers } = useQuery({
    queryKey: ['managers'],
    queryFn: () => api<Manager[]>('/admin/orders/managers'),
    staleTime: 5 * 60_000,
  });
  const assign = useApiMutation(
    (managerId: string | null) => api(`/admin/orders/${order.id}/assign`, { method: 'PATCH', body: { managerId } }),
    { invalidate: [['order', order.id], ['orders']], success: t('order.managerAssigned') },
  );
  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      {t('order.manager')}
      <OptionSelect
        className="w-48"
        aria-label={t('order.manager')}
        value={order.managerId ?? ''}
        disabled={assign.isPending}
        onValueChange={(v) => assign.mutate(v || null)}
        emptyLabel={t('common.unassigned')}
        options={(managers ?? []).map((m) => ({ value: m.id, label: m.fullName ?? formatPhone(m.phone) }))}
      />
    </label>
  );
}
