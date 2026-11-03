import { Ionicons } from '@expo/vector-icons';
import { createContext, use, useCallback, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Switch,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { colors, radius, space } from '../lib/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export { Ionicons };

// ───────────── Matn ─────────────

type TextVariant = 'title' | 'h2' | 'body' | 'small' | 'caption';
const TEXT: Record<TextVariant, TextStyle> = {
  title: { fontSize: 24, fontWeight: '700' },
  h2: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15 },
  small: { fontSize: 13 },
  caption: { fontSize: 12, color: colors.muted },
};

export function Text({
  v = 'body',
  style,
  children,
  muted,
  bold,
  color,
  numberOfLines,
}: {
  v?: TextVariant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  muted?: boolean;
  bold?: boolean;
  color?: string;
  numberOfLines?: number;
}) {
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[{ color: colors.text }, TEXT[v], muted && { color: colors.muted }, bold && { fontWeight: '600' }, color ? { color } : null, style]}
    >
      {children}
    </RNText>
  );
}

// ───────────── Tugma ─────────────

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const bg = { primary: colors.brand, secondary: colors.card, danger: colors.danger, ghost: 'transparent' }[variant];
  const fg = { primary: '#fff', secondary: colors.text, danger: '#fff', ghost: colors.brand }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.button,
        small && { height: 36, paddingHorizontal: space(3) },
        { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <RNText style={{ color: fg, fontWeight: '600', fontSize: small ? 14 : 15 }}>{title}</RNText>
    </Pressable>
  );
}

// ───────────── Kiritish ─────────────

export function Input({ label, error, style, ...rest }: TextInputProps & { label?: string; error?: string | null }) {
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text v="small" bold>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        {...rest}
        style={[s.input, rest.multiline && { height: 88, paddingTop: 10, textAlignVertical: 'top' }, error ? { borderColor: colors.danger } : null, style]}
      />
      {error ? <Text v="caption" color={colors.danger}>{error}</Text> : null}
    </View>
  );
}

/** Bir nechta variantdan bittasini tanlash (Yetkazish / Olib ketish) */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={s.segmented}>
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segment, value === o.value && s.segmentOn]}>
          <Text v="small" bold color={value === o.value ? colors.text : colors.muted}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.brand, false: colors.border }} thumbColor="#fff" />
    </Row>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
      <Text v="small" bold color={active ? '#fff' : colors.text}>{label}</Text>
    </Pressable>
  );
}

// ───────────── Konteynerlar ─────────────

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.9 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'success' | 'warning' | 'danger' | 'info' | 'violet' | 'brand' }) {
  const map = {
    muted: ['#f5f5f4', colors.muted],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
    info: [colors.infoSoft, colors.info],
    violet: [colors.violetSoft, colors.violet],
    brand: [colors.brandSoft, colors.brandDark],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text v="caption" bold color={fg}>{label}</Text>
    </View>
  );
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: space(2) }} />;
}

export function Loader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8) }}>
      <ActivityIndicator color={colors.brand} size="large" />
    </View>
  );
}

export function Empty({ icon, title, hint, action }: { icon: IconName; title: string; hint?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: space(10), gap: space(2) }}>
      <Ionicons name={icon} size={48} color={colors.faint} />
      <Text v="h2">{title}</Text>
      {hint ? <Text muted style={{ textAlign: 'center' }}>{hint}</Text> : null}
      {action}
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <View style={{ padding: space(6), gap: space(3), alignItems: 'center' }}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.faint} />
      <Text muted style={{ textAlign: 'center' }}>{error instanceof Error ? error.message : 'Xatolik'}</Text>
      {onRetry ? <Button title="↻" variant="secondary" small onPress={onRetry} /> : null}
    </View>
  );
}

/** Miqdor: − [12.5] + (qadam bilan) */
/**
 * onChange — har o'zgarishda (qoralama); onCommit — +/- bosilganda yoki yozib bo'lingach (serverga yuborish uchun).
 */
export function QtyStepper({
  value,
  onChange,
  onCommit,
  step,
  min,
  unit,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit?: (v: string) => void;
  step: number;
  min: number;
  unit: string;
}) {
  const n = Number(value) || 0;
  const fix = (x: number) => String(Math.round(x * 1000) / 1000);
  const set = (v: string) => {
    onChange(v);
    onCommit?.(v);
  };
  return (
    <Row gap={0} style={s.stepper}>
      <Pressable style={s.stepBtn} onPress={() => set(fix(Math.max(min, n - step)))} accessibilityLabel="−">
        <Ionicons name="remove" size={20} color={colors.text} />
      </Pressable>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(',', '.').replace(/[^\d.]/g, ''))}
        onEndEditing={() => onCommit?.(value)}
        keyboardType="decimal-pad"
        style={s.stepInput}
      />
      <Text v="small" muted style={{ marginRight: 6 }}>{unit}</Text>
      <Pressable style={s.stepBtn} onPress={() => set(fix(n < min ? min : n + step))} accessibilityLabel="+">
        <Ionicons name="add" size={20} color={colors.text} />
      </Pressable>
    </Row>
  );
}

// ───────────── Toast ─────────────

type ToastKind = 'success' | 'error' | 'info';
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => undefined);

/** RN web'da Alert ishlamaydi — o'zimizning toast hamma platformada bir xil */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(
    (msg: string, kind: ToastKind = 'info') => {
      clearTimeout(timer.current);
      setToast({ msg, kind });
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
      }, 3000);
    },
    [opacity],
  );

  const bg = toast?.kind === 'error' ? colors.danger : toast?.kind === 'success' ? colors.success : colors.text;
  return (
    <ToastCtx value={show}>
      {children}
      {toast && (
        <Animated.View pointerEvents="none" style={[s.toast, { opacity, backgroundColor: bg }]}>
          <RNText style={{ color: '#fff', fontWeight: '500' }}>{toast.msg}</RNText>
        </Animated.View>
      )}
    </ToastCtx>
  );
}

export function useToast() {
  return use(ToastCtx);
}

const s = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: radius.md,
    paddingHorizontal: space(4),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    fontSize: 16,
    backgroundColor: colors.card,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space(4),
  },
  segmented: { flexDirection: 'row', backgroundColor: '#f5f5f4', borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  segmentOn: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  stepper: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.card, height: 48 },
  stepBtn: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  stepInput: { width: 64, textAlign: 'center', fontSize: 17, fontWeight: '600', color: colors.text, height: 46 },
  toast: {
    position: 'absolute',
    left: space(4),
    right: space(4),
    bottom: 100,
    // Web'da ilova 480px ramkada — toast ham shu kenglikda, markazda
    maxWidth: 480 - space(8),
    marginHorizontal: 'auto',
    padding: space(4),
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
});
