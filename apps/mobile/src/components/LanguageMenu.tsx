import { useRef, useState, type ComponentRef } from 'react';
import { Dimensions, View } from 'react-native';
import { Flag, PopoverPanel, PressableScale, Tooltip } from '@/components/ui';
import { LANGUAGES, useI18n } from '@/i18n';
import { radius, space, useTheme } from '@/theme';

/**
 * Til tanlash (sarlavha, kirish ekrani, sayt pastki qismi): joriy til bayrog'i → bayroqlar ro'yxati.
 * Faqat bayroq — til nomi ekran o'quvchi va tooltip'da. Pastda joy yetmasa ro'yxat tugma ustida ochiladi.
 */
export function LanguageMenu({ compact }: { compact?: boolean }) {
  const { t, locale, setLocale } = useI18n();
  const { colors } = useTheme();
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [hover, setHover] = useState(false);
  const button = compact ? 32 : 40;
  const option = compact ? 36 : 40;
  const current = LANGUAGES.find((l) => l.value === locale)?.label ?? '';
  const label = `${t('language')}: ${current}`;

  const open = () =>
    anchor.current?.measureInWindow((x, y, width, height) => {
      const win = Dimensions.get('window');
      const panel = LANGUAGES.length * (option + 2) + space(4);
      const below = y + height + space(1);
      setPos({ top: below + panel > win.height ? y - panel - space(1) : below, right: win.width - (x + width) });
    });
  const close = () => setPos(null);

  return (
    <>
      <View ref={anchor} collapsable={false}>
        <PressableScale
          onPress={open}
          onHoverIn={() => setHover(true)}
          onHoverOut={() => setHover(false)}
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ expanded: !!pos }}
          scale={0.95}
          hoverStyle={{ backgroundColor: colors.muted }}
          style={{ width: button, height: button, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md }}
        >
          <Flag locale={locale} small={compact} />
          <Tooltip label={current} visible={hover && !pos} />
        </PressableScale>
      </View>

      <PopoverPanel pos={pos} onClose={close}>
        <View accessibilityRole="radiogroup" accessibilityLabel={t('language')} style={{ gap: 2 }}>
          {LANGUAGES.map((l) => {
            const active = l.value === locale;
            return (
              <PressableScale
                key={l.value}
                onPress={() => {
                  setLocale(l.value);
                  close();
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
