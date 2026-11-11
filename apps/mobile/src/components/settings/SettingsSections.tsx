import { router } from 'expo-router';
import { useState } from 'react';
import { useThemeOptions } from '@/components/ThemeSwitch';
import { ListGroup, ListItem, OptionList, Sheet, Text } from '@/components/ui';
import { LANGUAGES, useI18n } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { useThemeSettings } from '@/theme';

/** Til, mavzu, parol va chiqish — mijoz profilida ham, haydovchi sozlamalarida ham bir xil */
export function SettingsSections({ passwordChange = true }: { passwordChange?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  const { logout } = useAuth();
  const { preference, setPreference } = useThemeSettings();
  const [sheet, setSheet] = useState<'language' | 'theme' | null>(null);
  const themes = useThemeOptions();
  const value = (s: string) => <Text v="small" muted>{s}</Text>;

  return (
    <>
      <ListGroup title={t('settings')}>
        <ListItem title={t('language')} right={value(LANGUAGES.find((l) => l.value === locale)!.label)} onPress={() => setSheet('language')} />
        <ListItem title={t('theme')} right={value(themes.find((x) => x.value === preference)!.label)} onPress={() => setSheet('theme')} />
        {passwordChange && <ListItem title={t('changePassword')} onPress={() => router.push('/password')} />}
      </ListGroup>
      <ListGroup>
        <ListItem title={t('logout')} destructive onPress={() => void logout()} />
      </ListGroup>

      <Sheet open={sheet === 'language'} onClose={() => setSheet(null)} title={t('language')}>
        <OptionList
          value={locale}
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
          onChange={(l) => {
            setLocale(l);
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet open={sheet === 'theme'} onClose={() => setSheet(null)} title={t('theme')}>
        <OptionList
          value={preference}
          options={themes}
          onChange={(p) => {
            setPreference(p);
            setSheet(null);
          }}
        />
      </Sheet>
    </>
  );
}
