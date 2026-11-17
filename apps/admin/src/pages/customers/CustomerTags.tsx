import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/i18n';
import type { CustomerProfile } from '@/lib/types';

/** Mijoz turi va narx guruhi; nomlari bir xil bo'lsa (masalan "Usta") — bitta belgi */
export function CustomerTags({ profile: p, inactive }: { profile: CustomerProfile | null; inactive?: boolean }) {
  const { t, label } = useI18n();
  const type = p && label('customerType', p.type);
  return (
    <>
      {type && p.priceGroup?.name !== type && <Badge>{type}</Badge>}
      {p?.priceGroup && <Badge variant="primary">{p.priceGroup.name}</Badge>}
      {inactive && <Badge variant="destructive">{t('customers.inactive')}</Badge>}
    </>
  );
}
