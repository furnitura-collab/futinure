import { useState } from 'react';
import { View } from 'react-native';
import { CountBadge, Icon, PressableScale, Text, Tooltip, type IconName } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

export const NAV_HEIGHT = 44;
/** Sarlavhadagi boshqaruvlar (qidiruv, tugmalar) bir balandlikda */
const CONTROL_HEIGHT = 40;

export function NavItem({ label, active, badge = 0, onPress }: { label: string; active: boolean; badge?: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      scale={0.97}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{ height: 32, flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(3), borderRadius: radius.md }}
    >
      <Text v="small" bold={active} color={active ? colors.foreground : colors.mutedForeground} numberOfLines={1}>{label}</Text>
      {badge > 0 && <CountBadge count={badge} tone="violet" />}
      {/* Faol chiziq qatorning pastki chegarasiga yopishadi */}
      {active && <View style={{ position: 'absolute', left: space(3), right: space(3), bottom: -(NAV_HEIGHT - 32) / 2, height: 2, borderRadius: 1, backgroundColor: colors.primary }} />}
    </PressableScale>
  );
}

/** O'ngdagi harakat — faqat ikonka (nomi ekran o'quvchi va tooltip'da); son belgisi burchakda, faqat son */
export function HeaderAction({ icon, label, badge = 0, active, onPress }: { icon: IconName; label: string; badge?: number; active?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const [hover, setHover] = useState(false);
  return (
    <PressableScale
      onPress={onPress}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label} (${badge})` : label}
      accessibilityState={{ selected: !!active }}
      scale={0.95}
      hoverStyle={{ backgroundColor: colors.muted }}
      style={{
        width: CONTROL_HEIGHT,
        height: CONTROL_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.md,
        backgroundColor: active ? colors.muted : 'transparent',
      }}
    >
      <Icon name={icon} size={20} weight={active ? 'fill' : 'regular'} color={active ? colors.primary : undefined} />
      <Tooltip label={label} visible={hover} />
      {badge > 0 && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 2, right: 0 }}>
          <CountBadge count={badge} />
        </View>
      )}
    </PressableScale>
  );
}
