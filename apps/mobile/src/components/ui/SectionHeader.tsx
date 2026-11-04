import { View } from 'react-native';
import { space } from '@/theme';
import { PressableScale } from './Pressable';
import { Text } from './Text';

/** Bo'lim sarlavhasi (17 semibold) va ixtiyoriy o'ngdagi havola ("Hammasi") */
export function SectionHeader({ title, action, onAction, hint }: { title: string; action?: string; onAction?: () => void; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space(3) }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text v="h2">{title}</Text>
        {hint ? <Text v="caption">{hint}</Text> : null}
      </View>
      {action && onAction ? (
        <PressableScale onPress={onAction} accessibilityRole="link" hitSlop={8} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text v="small" bold tone="primary">{action}</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}
