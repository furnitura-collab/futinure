import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Ionicons, Text } from '../components/ui';
import { useAuth } from '../lib/auth';
import { colors, space } from '../lib/theme';

/** Xodim mobil ilovaga kirsa (haydovchi qismi keyingi bosqichda) */
export default function Staff() {
  const { me, logout } = useAuth();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8), gap: space(4) }}>
        <Ionicons name="desktop-outline" size={56} color={colors.faint} />
        <Text v="h2">{me?.fullName}</Text>
        <Text muted style={{ textAlign: 'center' }}>
          Xodimlar admin paneldan foydalanadi. / Сотрудники работают в админ-панели.
        </Text>
        <Button title="Chiqish / Выйти" variant="secondary" onPress={() => void logout()} />
      </View>
    </SafeAreaView>
  );
}
