import { Pressable, Text, View } from 'react-native';
import type { Palette } from './palette';

/** Tarmoq yo'q yoki server javob bermadi — qayta urinish */
export function Offline({ colors, onRetry }: { colors: Palette; onRetry: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32, backgroundColor: colors.background }}>
      <Text style={{ color: colors.foreground, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>Internetga ulanib bo'lmadi</Text>
      <Text style={{ color: colors.muted, fontSize: 14, textAlign: 'center' }}>Aloqani tekshirib, qayta urinib ko'ring</Text>
      <Pressable
        onPress={onRetry}
        accessibilityRole="button"
        style={({ pressed }) => ({ backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1, paddingHorizontal: 24, height: 44, borderRadius: 12, justifyContent: 'center' })}
      >
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Qayta urinish</Text>
      </Pressable>
    </View>
  );
}
