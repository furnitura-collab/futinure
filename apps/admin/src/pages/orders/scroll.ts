/** Gorizontal aylanadigan qatorlar (filtrlar, kanban, bosqichlar) uchun umumiy klasslar */

// Chetdagi soya: aylantirish mumkinligini bildiradi (mesh fon ustida gradient emas, mask)
const FADE = {
  both: '[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]',
  left: '[mask-image:linear-gradient(to_right,transparent,black_1.5rem)]',
  right: '[mask-image:linear-gradient(to_left,transparent,black_1.5rem)]',
};

/** `useEdgeFade` natijasidan mask klassi */
export function fadeClass({ left, right }: { left: boolean; right: boolean }) {
  return left && right ? FADE.both : left ? FADE.left : right ? FADE.right : undefined;
}

/** Kanban ustuni: telefonda ekranga bitta (85% — keyingisi chetda ko'rinadi), kattada teng bo'linadi */
export const COLUMN_WIDTH = 'min-w-[13.5rem] flex-1 basis-0 max-sm:min-w-[85%]';
