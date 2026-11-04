import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, toneColors, useTheme, type Tone } from '@/theme';
import { Button } from './Button';
import { GlassView } from './GlassView';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

type ToastKind = 'success' | 'error' | 'info';
const KIND: Record<ToastKind, { icon: IconName; tone: Tone }> = {
  success: { icon: 'checkmark-circle', tone: 'success' },
  error: { icon: 'alert-circle', tone: 'destructive' },
  info: { icon: 'notifications', tone: 'primary' },
};

export interface ToastAction {
  label: string;
  onPress: () => void;
}
type Show = (msg: string, kind?: ToastKind, action?: ToastAction) => void;

const ToastCtx = createContext<Show>(() => undefined);

/** RN web'da Alert ishlamaydi — o'zimizning toast hamma platformada bir xil */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors, shadowLg } = useTheme();
  const safe = useSafeAreaInsets();
  const [toast, setToast] = useState<{ id: number; msg: string; kind: ToastKind; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<Show>((msg, kind = 'info', action) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), msg, kind, action });
    // Tugmali xabarni bosishga ulgurish kerak
    timer.current = setTimeout(() => setToast(null), action ? 5000 : 3200);
  }, []);

  const k = toast ? KIND[toast.kind] : null;
  return (
    <ToastCtx value={show}>
      {children}
      <View pointerEvents="box-none" style={{ position: 'absolute', top: safe.top + space(2), left: space(4), right: space(4), alignItems: 'center' }}>
        {toast && k && (
          <Animated.View key={toast.id} entering={FadeInUp.duration(220)} exiting={FadeOutUp.duration(180)} style={{ width: '100%', maxWidth: 480 }}>
            <GlassView intensity={70} style={[{ borderRadius: radius.lg, paddingVertical: space(2), paddingLeft: space(4), paddingRight: space(2), minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space(3) }, shadowLg]}>
              <Icon name={k.icon} size={22} color={toneColors(colors, k.tone).fg} />
              <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">
                {toast.msg}
              </Text>
              {toast.action && (
                <Button
                  title={toast.action.label}
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    setToast(null);
                    toast.action?.onPress();
                  }}
                />
              )}
            </GlassView>
          </Animated.View>
        )}
      </View>
    </ToastCtx>
  );
}

export function useToast() {
  return use(ToastCtx);
}
