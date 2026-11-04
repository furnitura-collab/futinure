import { useEffect, useRef, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n } from '@/i18n';
import { useLayout } from '@/lib/layout';
import { radius, space, useTheme } from '@/theme';
import { IconButton } from './IconButton';
import { Text } from './Text';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Pastda doim ko'rinadigan asosiy tugma */
  footer?: ReactNode;
}

/** Pastdan chiquvchi panel (telefonda) / markazdagi oyna (keng ekranda) */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const { colors, shadowLg } = useTheme();
  const { t } = useI18n();
  const { wide } = useLayout();
  const safe = useSafeAreaInsets();

  // Escape'ni Modal ham, quyidagi tinglovchi ham ushlashi mumkin — bir ochilishda faqat bir marta yopamiz
  const closed = useRef(false);
  useEffect(() => {
    if (open) closed.current = false;
  }, [open]);
  const close = () => {
    if (closed.current) return;
    closed.current = true;
    onClose();
  };

  // Webda Modal Escape'ni har doim ham ushlamaydi (fokus oyna ichida bo'lmasa) — o'zimiz yopamiz
  useEffect(() => {
    if (Platform.OS !== 'web' || !open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: wide ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Animated.View entering={FadeIn.duration(200)} style={StyleSheet.absoluteFill}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={close} accessibilityLabel={t('close')} />
        </Animated.View>
        <Animated.View
          entering={SlideInDown.duration(250)}
          accessibilityViewIsModal
          style={[
            {
              width: '100%',
              maxHeight: '88%',
              backgroundColor: colors.card,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingBottom: footer ? 0 : Math.max(safe.bottom, space(4)),
            },
            wide && { maxWidth: 520, borderRadius: radius.xl },
            shadowLg,
          ]}
        >
          {!wide && <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.input, marginTop: space(2) }} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: space(4), paddingRight: space(2), paddingTop: space(2) }}>
            <Text v="h2" style={{ flex: 1 }} numberOfLines={2}>{title}</Text>
            <IconButton icon="close" label={t('close')} onPress={close} />
          </View>
          <ScrollView contentContainerStyle={{ padding: space(4), paddingTop: space(2), gap: space(4) }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? (
            <View style={{ padding: space(4), paddingBottom: Math.max(safe.bottom, space(4)), borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: space(3) }}>
              {footer}
            </View>
          ) : null}
        </Animated.View>
      </View>
    </Modal>
  );
}
