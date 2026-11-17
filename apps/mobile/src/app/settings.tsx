import { SettingsSections } from '@/components/settings/SettingsSections';
import { Screen } from '@/components/ui';
import { useI18n } from '@/i18n';

/** Haydovchi sozlamalari (mijozda — Profil ichida) */
export default function Settings() {
  const { t } = useI18n();
  return (
    <Screen width="form" title={t('settings')}>
      <SettingsSections />
    </Screen>
  );
}
