import type { Dictionary } from '../types';
import { common } from './common';
import { orders } from './orders';
import { catalog } from './catalog';
import { finance } from './finance';
import { access } from './access';

export const ru: Dictionary = { ...common, ...orders, ...catalog, ...finance, ...access };
