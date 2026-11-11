# Mebel Order — ish qoidalari

## Ish tartibi
- Har bir topshiriq uchun avval o'zingga **prompt (reja)** yoz: maqsad, aniqlangan muammolar, qadamlar, tekshiruv.
  Rejani javob boshida qisqa ko'rsat, keyin bajar.
- Foydalanuvchi bilan o'zbek (lotin) tilida yoz.
- Backend faqat Python (FastAPI, `apps/api-py`). Frontend — TypeScript (`apps/mobile` Expo, `apps/admin` Vite).
- O'zgarishdan keyin: typecheck, testlar (`pnpm test:api`, `packages/shared` va admin vitest), brauzerda ko'rib chiqish.

## UI qoidalari
- **Ikonka yoki matn — ikkalasi birga emas.**
  - Ikonka ma'no anglatsa (savat, qo'ng'iroqcha, qidiruv, yopish) — faqat ikonka; nomi `accessibilityLabel` / `aria-label`
    va `title` (tooltip) da bo'ladi.
  - Ikonka ma'no qo'shmasa — faqat matn, ikonka qo'yilmaydi.
- Son belgisi (badge) faqat sonni ko'rsatadi — narx, matn qo'shilmaydi.
- Til tanlash: sarlavhada bitta tugma (joriy til bayrog'i) → popup ichida bayroqlar. Bayroqlar SVG (`packages/shared/src/flags.ts`),
  emoji emas — Windows'da bayroq emojisi harf bo'lib chiqadi.
- Navigatsiya ko'payishi hisobga olinadi: sayt bo'limlari asosiy sarlavhada emas, uning ostidagi alohida qatorda
  (kerak bo'lsa gorizontal aylanadi); telefonda — pastki tab bar.
