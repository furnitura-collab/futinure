import { TextInput, View } from 'react-native';
import { font, makeStyles, radius } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface QtyStepperProps {
  value: string;
  /** Har o'zgarishda (qoralama) */
  onChange: (v: string) => void;
  /** +/- bosilganda yoki yozib bo'lingach — serverga yuborish uchun */
  onCommit?: (v: string) => void;
  step: number;
  min: number;
  unit: string;
}

/** Kasr qadamlar (0.5 m) to'plansa ham 0.1+0.2 xatosi chiqmasin */
const fix = (x: number) => String(Math.round(x * 1000) / 1000);
/** Vergulni nuqtaga, raqam bo'lmagan belgilarni olib tashlaydi */
const clean = (s: string) => s.replace(',', '.').replace(/[^\d.]/g, '');

export function QtyStepper({ value, onChange, onCommit, step, min, unit }: QtyStepperProps) {
  const s = useStyles();
  const n = Number(value) || 0;
  const set = (v: string) => {
    onChange(v);
    onCommit?.(v);
  };
  return (
    <View style={s.root}>
      <IconButton icon="remove" label="−" size={40} onPress={() => set(fix(Math.max(min, n - step)))} disabled={n <= min} />
      <TextInput
        value={value}
        onChangeText={(t) => onChange(clean(t))}
        onEndEditing={() => onCommit?.(value)}
        onBlur={() => onCommit?.(value)}
        keyboardType="decimal-pad"
        selectTextOnFocus
        accessibilityLabel={unit}
        style={s.input}
      />
      <Text v="small" muted style={s.unit}>{unit}</Text>
      <IconButton icon="add" label="+" size={40} onPress={() => set(fix(n < min ? min : n + step))} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.card,
  },
  input: { width: 60, height: 44, textAlign: 'center', fontSize: font.lg, fontWeight: '600', color: t.colors.foreground },
  unit: { marginRight: 2 },
}));
