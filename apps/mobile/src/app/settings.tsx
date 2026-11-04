import { SettingsSections } from '@/components/settings/SettingsSections';
import { Screen } from '@/components/ui';

/** Haydovchi sozlamalari (mijozda — Profil ichida) */
export default function Settings() {
  return (
    <Screen width="form">
      <SettingsSections />
    </Screen>
  );
}
