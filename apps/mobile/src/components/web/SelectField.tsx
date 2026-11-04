import { font, radius, useTheme } from '@/theme';

interface SelectFieldProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}

/**
 * Faqat saytda: brauzerning o'z <select>i — klaviatura, ekran o'quvchi va tizim ro'yxati tekin.
 * Native'da render qilinmaydi (u yerda Sheet + OptionList).
 */
export function SelectField<T extends string>({ value, options, onChange, label }: SelectFieldProps<T>) {
  const { colors } = useTheme();
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value as T)}
      style={{
        height: 40,
        padding: '0 12px',
        borderRadius: radius.md,
        border: `1px solid ${colors.input}`,
        background: colors.card,
        color: colors.foreground,
        fontSize: font.sm,
        fontWeight: 600,
        // RN Text bilan bir xil tizim shrifti (body'dan meros — serif bo'lib qoladi)
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        cursor: 'pointer',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
