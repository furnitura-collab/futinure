import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind klasslarini birlashtirish: to'qnashganda (w-full vs w-44) keyingisi yutadi */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
