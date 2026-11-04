import { useState, type ComponentRef, type ReactNode, type Ref } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { useI18n } from '@/i18n';
import { font, makeStyles, radius, space, useTheme } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  icon?: IconName;
  right?: ReactNode;
  /** Parol maydoni: ko'rsatish/yashirish tugmasi bilan */
  password?: boolean;
  ref?: Ref<ComponentRef<typeof TextInput>>;
}

export function Input({ label, error, hint, icon, right, password, style, multiline, onFocus, onBlur, ref, ...rest }: InputProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const s = useStyles();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const borderColor = error ? colors.destructive : focused ? colors.primary : colors.input;

  return (
    <View style={s.root}>
      {label ? <Text v="small" bold>{label}</Text> : null}
      <View style={[s.field, multiline && s.multiline, { borderColor }, focused && { boxShadow: `0 0 0 3px ${error ? colors.destructiveSoft : colors.ring}` }]}>
        {icon ? <Icon name={icon} size={18} muted /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.placeholder}
          {...rest}
          multiline={multiline}
          secureTextEntry={password ? hidden : rest.secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[s.input, multiline && s.inputMultiline, style]}
        />
        {password ? (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('showPassword')}>
            <Icon name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} muted />
          </Pressable>
        ) : null}
        {right}
      </View>
      {error ? (
        <Text v="caption" tone="destructive">{error}</Text>
      ) : hint ? (
        <Text v="caption">{hint}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { gap: 6 },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2),
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space(3),
    backgroundColor: t.colors.card,
  },
  multiline: { alignItems: 'flex-start', paddingVertical: space(2) },
  input: {
    flex: 1,
    minHeight: 46,
    fontSize: font.base + 1,
    color: t.colors.foreground,
    // Webda brauzerning o'z fokus chizig'i — o'rniga ring ishlatamiz
    outlineWidth: 0,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: space(1) },
}));
