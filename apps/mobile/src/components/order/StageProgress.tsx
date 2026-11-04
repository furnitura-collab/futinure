import { View } from 'react-native';
import { CUSTOMER_STAGES, customerStage, type OrderStatus } from '@mebel/shared';
import { useTheme } from '@/theme';

/** Kichik 5 bo'lakli progress (buyurtma kartalarida) — qayerdaligini bir qarashda ko'rsatadi */
export function StageProgress({ status }: { status: OrderStatus }) {
  const { colors } = useTheme();
  const stage = customerStage(status);
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: CUSTOMER_STAGES.length, now: stage + 1 }}>
      {CUSTOMER_STAGES.map((s, i) => (
        <View
          key={s}
          style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: stage < 0 ? colors.destructiveSoft : i <= stage ? colors.primary : colors.muted }}
        />
      ))}
    </View>
  );
}
