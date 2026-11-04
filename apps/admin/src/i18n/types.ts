import type { uz } from './uz';

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };

/** ru va en shu turga mos kelishi shart — yetishmagan yoki ortiqcha kalit tip xatosi beradi */
export type Dictionary = DeepString<typeof uz>;

type Leaves<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

export type TKey = Leaves<Dictionary>;
export type TParams = Record<string, string | number>;
