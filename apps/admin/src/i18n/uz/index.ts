import { common } from './common';
import { orders } from './orders';
import { catalog } from './catalog';
import { finance } from './finance';

/** Asosiy lug'at: kalitlar shu yerdan olinadi, ru va en aynan shu shaklga mos bo'lishi shart */
export const uz = { ...common, ...orders, ...catalog, ...finance };
