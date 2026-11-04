import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTheme } from '@/theme';

const ID = 'mebel-focus-ring';

/**
 * Klaviatura bilan yurganda ko'rinadigan fokus chizig'i (sichqonchada chiqmaydi — :focus-visible).
 * Har bir Pressable'ga alohida yozgandan ko'ra bitta global qoida; maydonlarda o'z "ring"i bor.
 */
export function useWebFocusRing(enabled = true) {
  const { colors } = useTheme();
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;
    const el = document.getElementById(ID) ?? document.head.appendChild(Object.assign(document.createElement('style'), { id: ID }));
    el.textContent = `[tabindex]:focus-visible:not(input):not(textarea), select:focus-visible { outline: 2px solid ${colors.primary}; outline-offset: 2px; }`;
  }, [colors.primary, enabled]);
}
