/** Sichqonchali qurilma. Sensorli ekranda avtofokus klaviaturani o'zi ochadi (va pastki tab bar yashirinadi) */
export const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

/** Radix onOpenAutoFocus: telefonda dialog birinchi maydonga o'zi fokus bermaydi; ataylab qo'yilgan autoFocus ishlaydi */
export const touchSafeAutoFocus = (handler?: (e: Event) => void) => (e: Event) => {
  if (!FINE_POINTER) e.preventDefault();
  handler?.(e);
};
