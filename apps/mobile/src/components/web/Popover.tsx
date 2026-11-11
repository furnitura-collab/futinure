import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useI18n } from '@/i18n';
import { radius, space, useTheme } from '@/theme';

interface Anchor {
  top: number;
  right: number;
}

/**
 * Tugma ostida ochiladigan panel (sayt sarlavhasi menyulari).
 * Tashqariga bosish yoki Esc — yopadi. `anchor` tugmani o'rab turgan View'ga beriladi.
 */
export function usePopover() {
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const [pos, setPos] = useState<Anchor | null>(null);
  const open = () =>
    anchor.current?.measureInWindow((x, y, width, height) => setPos({ top: y + height + space(2), right: window.innerWidth - (x + width) }));
  const close = () => setPos(null);
  return { anchor, pos, open, close, expanded: !!pos };
}

export function PopoverPanel({ pos, onClose, width, children }: { pos: Anchor | null; onClose: () => void; width?: number; children: ReactNode }) {
  const { t } = useI18n();
  const { colors, shadowLg } = useTheme();
  return (
    <Modal transparent visible={!!pos} onRequestClose={onClose} animationType="none">
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
