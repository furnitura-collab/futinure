/**
 * O'zbekiston raqamini +998XXXXXXXXX ko'rinishiga keltiradi.
 * Qabul qiladi: "+998 90 123 45 67", "998901234567", "90 123-45-67", "(90) 1234567".
 */
export function normalizeUzPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  let local: string;
  if (digits.length === 12 && digits.startsWith('998')) local = digits.slice(3);
  else if (digits.length === 9) local = digits;
  else return null;
  // Operator kodi 0 bilan boshlanmaydi
  if (local.startsWith('0')) return null;
  return `+998${local}`;
}

export const UZ_PHONE_RE = /^\+998[1-9]\d{8}$/;

/** Kiritish maydoni uchun: "+998" alohida turadi, foydalanuvchi faqat 9 ta raqamni yozadi — "90 123 45 67" */
export function formatUzPhoneInput(input: string): string {
  let digits = input.replace(/\D/g, '');
  // To'liq raqam joylashtirilsa (+998 90 ...) — mamlakat kodi tashlanadi
  if (digits.length > 9 && digits.startsWith('998')) digits = digits.slice(3);
  digits = digits.slice(0, 9);
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean).join(' ');
}
