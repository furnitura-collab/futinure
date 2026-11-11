import type { Locale } from './enums.js';

/**
 * Til tanlash bayroqlari (3:2). Emoji emas — Windows'da bayroq emojisi "UZ" harflari bo'lib chiqadi.
 * Kichik o'lchamda ko'rsatish uchun soddalashtirilgan.
 */
const UZ_STARS = [
  [131, 14], [149, 14], [167, 14],
  [113, 32], [131, 32], [149, 32], [167, 32],
  [95, 50], [113, 50], [131, 50], [149, 50], [167, 50],
]
  .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4" fill="#fff"/>`)
  .join('');

const FLAG_SVG: Record<Locale, string> = {
  uz:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200">' +
    '<rect width="300" height="200" fill="#fff"/>' +
    '<rect width="300" height="64" fill="#0099B5"/>' +
    '<rect y="136" width="300" height="64" fill="#1EB53A"/>' +
    '<rect y="64" width="300" height="4" fill="#CE1126"/>' +
    '<rect y="132" width="300" height="4" fill="#CE1126"/>' +
    '<circle cx="52" cy="32" r="22" fill="#fff"/><circle cx="61" cy="32" r="19" fill="#0099B5"/>' +
    UZ_STARS +
    '</svg>',
  ru:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2">' +
    '<rect width="3" height="2" fill="#fff"/><rect y=".667" width="3" height=".667" fill="#0039A6"/>' +
    '<rect y="1.333" width="3" height=".667" fill="#D52B1E"/></svg>',
  en:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice">' +
    '<clipPath id="t"><path d="M30,15h30v15zv15h-30zh-30v-15zv-15h30z"/></clipPath>' +
    '<rect width="60" height="30" fill="#012169"/>' +
    '<path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/>' +
    '<path d="M0,0L60,30M60,0L0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/>' +
    '<path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/>' +
    '<path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>',
};

/** <img src> / expo-image uchun tayyor manzil */
export const flagUri = (locale: Locale) => `data:image/svg+xml;utf8,${encodeURIComponent(FLAG_SVG[locale])}`;
