import { View } from 'react-native';
import { Flag, PopoverPanel, PressableScale, usePopover } from '@/components/ui';
import { LANGUAGES, useI18n } from '@/i18n';
import { radius, space, useTheme } from '@/theme';

/**
 * Til tanlash (sayt va ilova sarlavhasi): joriy til bayrog'i → ostida select kabi ochiladigan ro'yxat (bayroqlar ustma-ust).
 * Faqat bayroq — til nomi ekran o'quvchi uchun. compact — ilova sarlavhasi uchun kichikroq.
 */
export function LanguageMenu({ compact }: { compact?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  const { colors } = useTheme();
  const menu = usePopover();
  const button = compact ? 32 : 40;
  const option = compact ? 36 : 40;

  return (
    <>
      <View ref={menu.anchor} collapsable={false}>
        <PressableScale
          onPress={menu.open}
          accessibilityRole="button"
          accessibilityLabel={`${t('language')}: ${LANGUAGES.find((l) => l.value === locale)?.label}`}
          accessibilityState={{ expanded: menu.expanded }}
          scale={0.95}
          hoverStyle={{ backgroundColor: colors.muted }}
          style={{ width: button, height: button, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}
        >
          <Flag locale={locale} small={compact} />
        </PressableScale>
      </View>

      <PopoverPanel pos={menu.pos} onClose={menu.close}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('language')} style={{ gap: 2 }}>
          {LANGUAGES.map((l) => {
            const active = l.value === locale;
            return (
              <PressableScale
                key={l.value}
                onPress={() => {
                  setLocale(l.value);
                  menu.close();
                }}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={l.label}
                scale={0.97}
                hoverStyle={{ backgroundColor: colors.muted }}
                style={{
                  width: option + space(4),
                  height: option,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.md,
                  backgroundColor: active ? colors.muted : 'transparent',
                }}
              >
                <Flag locale={l.value} small={compact} />
              </PressableScale>
            );
          })}
        </View>
      </PopoverPanel>
    </>
  );
}
