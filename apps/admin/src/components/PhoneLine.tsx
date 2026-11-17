import { formatPhone } from '@mebel/shared';
import { Phone } from '@/components/icons';
import { useI18n } from '@/i18n';
import { CopyButton } from './CopyButton';
import { IconLink } from './IconLink';

/** Telefon: raqam matn, qo'ng'iroq va nusxa — ikonka */
export function PhoneLine({ phone }: { phone: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-1">
      <span className="tabular">{formatPhone(phone)}</span>
      <IconLink href={`tel:${phone}`} icon={Phone} label={t('common.call')} size="icon-xs" />
      <CopyButton value={phone} label={t('common.copyPhone')} />
    </div>
  );
}
