import { cn } from '@/lib/utils';

/** Telefonda ekran chetigacha cho'ziladi (main'ning px-3 chekinishi qaytariladi) */
const EDGE = 'max-sm:-mx-3 max-sm:w-[calc(100%+1.5rem)] max-sm:px-3';

/** Tablar ro'yxati telefonda gorizontal aylanadi; indikator chizig'i kesilmasin — pb */
export const SCROLL_TABS = cn('h-auto w-full justify-start overflow-x-auto overscroll-x-contain border-b pb-[5px] no-scrollbar', EDGE);
