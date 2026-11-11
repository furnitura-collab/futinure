import { common } from './common';
import { catalog } from './catalog';
import { orders } from './orders';
import { profile } from './profile';

/** Asosiy lug'at — kalitlar shu yerdan olinadi; ru/en shu turga mos bo'lishi shart */
export const uz = { ...common, ...catalog, ...orders, ...profile };

export type Dict = Record<keyof typeof uz, string>;
export type Key = keyof Dict;
