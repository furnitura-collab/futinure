import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Dimensions, Modal, Pressable, View } from 'react-native';
import { useI18n } from '@/i18n';
import { radius, space, useTheme } from '@/theme';

interface Anchor {
  top: number;
  right: number;
}

/**
 * Tugma ostida ochiladigan panel (sarlavha menyulari) — sayt va ilovada bir xil.
 * Tashqariga bosish, Esc yoki Android "orqaga" — yopadi. `anchor` tugmani o'rab turgan View'ga beriladi.
 */
export function usePopover() {
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [pos, setPos] = useState<Anchor | null>(null);
  const open = () =>
    anchor.current?.measureInWindow((x, y, width, height) => setPos({ top: y + height + space(1), right: Dimensions.get('window').width - (x + width) }));
  const close = () => setPos(null);
  return { anchor, pos, open, close, expanded: !!pos };
}

export function PopoverPanel({ pos, onClose, width, children }: { pos: Anchor | null; onClose: () => void; width?: number; children: ReactNode }) {
  const { t } = useI18n();
  const { colors, shadowLg } = useTheme();
  return (
    // statusBarTranslucent: Android'da Modal koordinatalari measureInWindow bilan bir xil bo'lsin (status bar ostidan)
    <Modal transparent visible={!!pos} onRequestClose={onClose} animationType="none" statusBarTranslucent>
      <Pressable style={{ flex: 1, cursor: 'auto' }} onPress={onClose} accessibilityLabel={t('close')}>
        {pos && (
          // Panel ichidagi bosish orqa fonga o'tib panelni yopmasin
          <Pressable
            onPress={() => undefined}
            style={[
              {
                position: 'absolute',
                top: pos.top,
                right: pos.right,
                width,
                backgroundColor: colors.card,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                padding: space(2),
                cursor: 'auto',
              },
              shadowLg,
            ]}
          >
            {children}
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}
