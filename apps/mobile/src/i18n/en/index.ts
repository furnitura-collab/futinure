import type { Dict } from '../uz';
import { common } from './common';
import { catalog } from './catalog';
import { orders } from './orders';
import { profile } from './profile';

export const en: Dict = { ...common, ...catalog, ...orders, ...profile };
