import { View } from 'react-native';
import { Flag, PressableScale } from '@/components/ui';
import { LANGUAGES, useI18n } from '@/i18n';
import { radius, space, useTheme } from '@/theme';
import { PopoverPanel, usePopover } from './Popover';

/** Sarlavhadagi til tanlash: joriy til bayrog'i → popupda hamma bayroqlar (nomi — ekran o'quvchi uchun) */
export function LanguageMenu() {
  const { t, locale, setLocale } = useI18n();
  const { colors } = useTheme();
  const menu = usePopover();

  return (
    <>
      <View ref={menu.anchor} collapsable={false}>
        <PressableScale
          onPress={menu.open}
          accessibilityRole="button"
          accessibilityLabel={`${t('language')}: ${LANGUAGES.find((l) => l.value === locale)?.label}`}
          accessibilityState={{ expanded: menu.expanded }}
          scale={0.97}
          hoverStyle={{ backgroundColor: colors.muted }}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}
        >
          <Flag locale={locale} />
        </PressableScale>
      </View>

      <PopoverPanel pos={menu.pos} onClose={menu.close}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('language')} style={{ flexDirection: 'row', gap: space(1) }}>
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
                scale={0.95}
                hoverStyle={{ backgroundColor: colors.muted }}
                style={{ width: 48, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: active ? colors.muted : 'transparent' }}
              >
                <Flag locale={l.value} />
              </PressableScale>
            );
          })}
        </View>
      </PopoverPanel>
    </>
  );
}
