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
