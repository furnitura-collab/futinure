# Mebel Order — ish qoidalari

## Ish tartibi
- Har bir topshiriq uchun avval o'zingga **prompt (reja)** yoz: maqsad, aniqlangan muammolar, qadamlar, tekshiruv.
  Rejani javob boshida qisqa ko'rsat, keyin bajar.
- Foydalanuvchi bilan o'zbek (lotin) tilida yoz.
- Backend faqat Python (FastAPI, `apps/api-py`). Frontend — TypeScript (`apps/mobile` Expo, `apps/admin` Vite).
- O'zgarishdan keyin: typecheck, testlar (`pnpm test:api`, `packages/shared` va admin vitest), brauzerda ko'rib chiqish.

## Kod qoidalari
- **Hech qaysi kod fayli 250 qatordan oshmasin** (`.py`, `.ts`, `.tsx`, testlar ham). Oshsa — mas'uliyat bo'yicha
  bo'linadi, eski import yo'llari re-export orqali saqlanadi. Tekshirish:
  `git ls-files '*.py' '*.ts' '*.tsx' | xargs wc -l | awk '$1>250 && $2!="total"'`
- Baza uzoqda (har so'rov yuzlab ms) — so'rovlar sonini kamaytir; ochiq katalog Redis keshida (`app/core/cache.py`),
  admin o'zgarishi keshni avtomatik yangilaydi. Har javobda `Server-Timing` (SQL soni va vaqti) bor.
- **Ruxsatlar — rol emas, ruxsat nomi** (`orders.view`, `catalog.edit`…): yagona manba `packages/shared/src/permissions.ts`
  ↔ `apps/api-py/app/auth/permissions.py` (testda solishtiriladi). Backend: `u: Can("orders.view")`; admin: `can('orders.manage')`.
  Yangi endpoint yoki rol o'zgarsa `tests/route_roles.txt` testi yiqiladi — ataylab bo'lsa `uv run python -m tests.support_routes`.
  Matritsa: `docs/15-roles-permissions-prompt.md`. Shared o'zgarsa — `pnpm --filter @mebel/shared build`.

## Mobil ilova yangilanishi (APK)
- APK o'rnatilgan paytdagi holat. **JS/UI o'zgarishi** (ekranlar, matn, stil) — EAS Update bilan, qayta o'rnatishsiz:
  `cd apps/mobile && pnpm ota "qisqa izoh"` (kanal `preview`, muhit `preview`). Telefonda ilova 1–2 marta to'liq yopib ochilganda yangilanadi.
- **Native o'zgarish** (yangi native kutubxona, ruxsat, `app.json` plugin, Expo SDK) — yangi APK:
  `app.json` da `version` (runtimeVersion = appVersion) va `android.versionCode` oshiriladi, keyin
  `npx eas-cli@latest build -p android --profile preview`. Versiya oshsa eski APK'lar yangi OTA'ni olmaydi — shuning uchun faqat shunda oshiriladi.
- `EXPO_PUBLIC_API_URL` — EAS muhitlarida (preview, production); `eas update` `eas.json` dagi `env`ni o'qimaydi.
- **Xodim ilovasi** (`apps/staff`, "Mebel Xodim") — admin panelning o'zi (WebView) + native qobiq (orqaga tugmasi, fayl
  ulashish, chop etish: `apps/admin/src/lib/native.ts` ↔ `apps/staff/src/bridge.ts`). Admin o'zgarishi ilovaga darhol yetadi
  (deploy yetarli); faqat qobiq o'zgarsa — `apps/staff` da EAS build. Admin telefon dizayni: `< lg` — pastki tab bar.
- Android'da JS dvigateli Hermes: brauzerdagi hamma API yo'q (masalan `Intl.PluralRules`). Webda ishlashi telefonda ishlashini
  kafolatlamaydi — yangi `Intl`/brauzer API'sidan oldin Hermes'da borligini tekshir, yo'q bo'lsa o'zing yoz.

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
