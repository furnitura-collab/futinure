import { useI18n } from '@/i18n';

/** Balans: musbat — qarz, manfiy — mijoz haqdor */
export function BalanceText({ value }: { value: number }) {
  const { t, money } = useI18n();
  if (value > 0) return <span className="font-medium text-warning">{t('balance.debt', { amount: money(value) })}</span>;
  if (value < 0) return <span className="font-medium text-success">{t('balance.credit', { amount: money(-value) })}</span>;
  return <span className="text-muted-foreground">0</span>;
}
