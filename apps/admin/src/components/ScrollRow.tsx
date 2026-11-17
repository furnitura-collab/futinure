import { cn } from '@/lib/utils';

/** Telefonda ekran chetigacha cho'ziladi (main'ning px-3 chekinishi qaytariladi) */
const EDGE = 'max-sm:-mx-3 max-sm:w-[calc(100%+1.5rem)] max-sm:px-3';
const ROW = 'flex gap-2 overflow-x-auto overscroll-x-contain no-scrollbar max-sm:snap-x max-sm:scroll-px-3';

/** Filtrlar: telefonda bitta qatorda gorizontal aylanadi; kattaroq ekranda — ota Toolbar'ning oddiy elementlari */
export const SCROLL_ROW = cn(ROW, EDGE, 'sm:contents');

/** Filtrlar: telefonda ham, kattaroq ekranda ham alohida aylanadigan qator */
export const SCROLL_ROW_FLEX = cn(ROW, EDGE, 'sm:max-w-full');

/** Tablar ro'yxati telefonda gorizontal aylanadi; indikator chizig'i kesilmasin — pb */
export const SCROLL_TABS = cn('h-auto w-full justify-start overflow-x-auto overscroll-x-contain border-b pb-[5px] no-scrollbar', EDGE);
