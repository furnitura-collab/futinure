import { SettingsSections } from '@/components/settings/SettingsSections';
import { EmptyState, Screen } from '@/components/ui';
import { useI18n } from '@/i18n';

/** Xodim mobil ilovaga kirsa — admin panelga yo'naltiramiz (parolni super admin o'rnatadi) */
export default function Staff() {
  const { t } = useI18n();
  return (
    <Screen width="form" contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <EmptyState icon="desktop-outline" title={t('staffTitle')} hint={t('staffHint')} />
      <SettingsSections passwordChange={false} />
    </Screen>
  );
}
