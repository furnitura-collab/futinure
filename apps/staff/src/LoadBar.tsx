import { StyleSheet, View } from 'react-native';

/** Yuklanish chizig'i (yuqorida, 2px) — sahifa to'liq yuklangach yo'qoladi */
export function LoadBar({ progress, color }: { progress: number; color: string }) {
  if (progress >= 1) return null;
  return (
    <View pointerEvents="none" style={styles.track}>
      <View style={[styles.bar, { width: `${Math.max(progress, 0.08) * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, zIndex: 10 },
  bar: { height: 2, borderRadius: 1 },
});
