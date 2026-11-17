# Admin panel — professional glass UI, tezlik va DnD (prompt)

Sen senior frontend muhandisi va mahsulot dizaynerisan. Vazifa — `apps/admin` (xodimlar paneli: super admin,
menejer, omborchi) ni xalqaro darajadagi boshqaruv paneli (Linear, Vercel, Stripe Dashboard) uslubida qayta qurish.
Foydalanuvchi oddiy odam: interfeys birinchi qarashda tushunarli, boshqaruv esa tez va qulay bo'lishi kerak.

## 0. Hozirgi holat (boshlang'ich nuqta)

- React 19, Vite 8, Tailwind 4, TanStack Query 5, react-router 8, Radix (shadcn), lucide-react, sonner.
- Sahifalar `lazy()` bilan bo'lingan, API — FastAPI (`apps/api-py`), ochiq katalog Redis keshida.
- Asosiy rang hozir amber/orange — **yorqin purple**ga o'tadi. Inter shrifti e'lon qilingan, lekin yuklanmaydi.
- `.glass` utility bor, `backdrop-filter` har kartada — ko'p kartali sahifada GPU yuki.
- `body` fonida `background-attachment: fixed` — aylantirishda har kadr qayta chiziladi.
- Kanban faqat ko'rish uchun; rasm, kategoriya tartibi va fayl yuklashda DnD yo'q.

## 1. Dizayn tizimi

1. **Rang.** Primary — yorqin purple: yorug'da `oklch(0.56 0.25 292)`, qorong'ida `oklch(0.72 0.2 292)`.
   `accent`, `ring`, fon mesh-gradientlari (purple / fuchsia / indigo) shunga moslanadi. Holat ranglari
   (success, warning, destructive, info, teal) o'zgarmaydi — ular ma'no beradi. `violet` tone purple bilan
   adashmasin — u indigo tomonga suriladi.
2. **Glass.** Ikki daraja:
   - `glass` — sarlavha, yon panel, popover/dialog/sheet: blur + yarim shaffof fon + nozik ichki yorug' chiziq.
   - `surface` — kartalar, jadvallar, kanban ustunlari: blur'siz, yarim shaffof fon va chegara (tezlik uchun).
   Fon mesh `body::before` dagi `position: fixed` qatlamda — `background-attachment: fixed` yo'q.
3. **Shrift.** Inter Variable o'zimizda (`@fontsource-variable/inter`), `font-display: swap`. Raqamlar `tabular`.
4. **Zichlik.** Sahifa sarlavhasi ixcham (h1 `text-xl`, izoh bir qatorda), bo'limlar orasi `gap-4`, karta ichi `p-4`.
   Filtrlar, qidiruv va amallar — bitta `Toolbar` qatorida. Bo'sh joy ma'lumotga beriladi, bezakka emas.
5. **Minimalizm.** Takroriy sarlavha/izoh, ma'nosiz ikonka, kerakmas chegara va soya olib tashlanadi.

## 2. Ikonka qoidasi (CLAUDE.md bilan bir xil, kuchaytirilgan)

- Kutubxona: **Phosphor Icons** (`@phosphor-icons/react`) — faqat `components/icons.ts` reyestri orqali
  (ikonkalar alohida fayllardan import qilinadi; kutubxonani almashtirish — bitta fayl). Faol menyu bandi `weight="fill"`.
- **Ikonka yoki matn — ikkalasi birga emas.**
  - Amalni ikonka bilan ifodalash mumkin bo'lsa (eksport, import, chop etish, tahrirlash, o'chirish, kirim,
    xaritada ko'rish, chekni ochish, qayta urinish, yangilash, filtr, ko'rinish almashtirish) — **faqat ikonka**,
    `IconButton` orqali: `aria-label` + kichik tooltip (hover/focus, `text-xs`, 300 ms kechikish).
  - Asosiy CTA (yangi mahsulot, qabul qilish, pul tushdi) — **faqat matn**, ikonka qo'yilmaydi.
  - Bezak ikonkalar (StatCard burchagi, bo'lim sarlavhasi oldidagi ikonka) — olib tashlanadi.
- Yon menyu — istisno: ochiq holatda ikonka + nom (navigatsiya standarti), yig'ilganda faqat ikonka + tooltip.
- Son belgisi (badge) faqat sonni ko'rsatadi.

## 3. Drag & drop (`@dnd-kit/core` + `@dnd-kit/sortable`)

1. **Kanban:** kartani boshqa ustunga sudrash = status o'tishi. Sudrash paytida faqat ruxsat etilgan ustunlar
   yonadi (`findTransition` + rol + yetkazish turi, `@mebel/shared`). Tashlanganda — mavjud `TransitionDialog`
   (shartlar, sabab, kim oldi) ochiladi; tasdiqlangach kanban yangilanadi. Klaviatura bilan ham ishlaydi.
2. **Mahsulot rasmlari:** tartibni sudrab o'zgartirish → `PUT /admin/products/{id}/images/order`;
   fayllarni zonaga tashlab yuklash.
3. **Kategoriyalar:** bir ota-kategoriya ichida sudrab tartiblash → yangi `PUT /admin/categories/order`
   (bitta so'rov, tranzaksiyada) — har qator uchun alohida PATCH emas.
4. **Excel import:** faylni dialogga tashlash (`DropZone`).
5. Umumiy komponentlar: `SortableList`, `DropZone` — boshqa joylarda qayta ishlatiladi.

## 4. Funksionallik yaxshilanishlari

- **Buyruqlar paneli (⌘K / Ctrl+K):** bo'limlarga o'tish, buyurtma raqami / mijoz / mahsulot bo'yicha qidiruv,
  tezkor amallar (yangi mahsulot, mavzu). Sarlavhada qidiruv ikonkasi bilan ham ochiladi.
- **Tezlik sezgisi:** menyu havolasiga hover/focus — sahifa chunk'i va asosiy so'rov oldindan yuklanadi.
  Ro'yxatlarda `placeholderData: keepPreviousData` — filtr o'zgarganda jadval "sakramaydi".
- **Buyurtmalar:** DnD kanban; ustun sarlavhasida son; kartada faqat muhim belgilar; jadval/kanban — ikonka
  almashtirgich. Buyurtma sahifasida amallar sarlavhada, ikkilamchi amallar ikonka.
- **Katalog:** toolbar amallari ikonka; qator ustida hover-amallar; rasm yo'q bo'lsa neytral placeholder.
- **Ombor, Mijozlar, Debitorlik, Xodimlar, To'lovlar:** ixcham toolbar, qator amallari `IconButton`,
  to'lov chekini dialogda ko'rish, bo'sh holatlar qisqa.
- **Login:** purple glass karta, til va mavzu bitta ixcham qatorda.

## 5. Tezlik

- Vite `manualChunks`: `react`, `radix`, `query`, `dnd`, `icons` — kesh uzoq yashaydi, yangilanishda kam yuklanadi.
- React Query: `staleTime` 30 s, `gcTime` 5 daqiqa, fokusda yangilash qoladi (realtime bilan birga).
- Blur faqat `glass` qatlamlarda; animatsiyalar `transform/opacity` bilan, `prefers-reduced-motion` hurmat qilinadi.
- Backend: yangi endpointlar bitta so'rov/tranzaksiyada; mavjud kesh invalidatsiyasi saqlanadi.

## 6. Arxitektura va kod

- `components/ui` — Radix primitivlar; `components/` — qayta ishlatiladigan kompozitlar (`IconButton`, `Toolbar`,
  `PageHeader`, `StatCard`, `DataTable`, `SortableList`, `DropZone`, `CommandPalette`); `pages/<bo'lim>/` — faqat
  shu bo'limga xos qismlar; `lib/` — hooklar, API, prefetch, DnD yordamchilari.
- **Har fayl ≤ 250 qator** (testlar ham). Oshsa — mas'uliyat bo'yicha bo'linadi, eski importlar re-export bilan.
- DRY: bir xil markup ikki joyda bo'lsa — komponent; bir xil mantiq — hook/funksiya.
- Kommentlar faqat "nega"ni tushuntiradi (biznes qoida, aylanib o'tish); kodni takrorlovchi kommentlar yo'q.
- Qat'iy tiplar, `any` yo'q. Matnlar faqat `t()` orqali, 3 tilda (uz, ru, en).

## 7. Bosqichlar

1. Poydevor: tokenlar (purple), glass/surface, shrift, fon, `IconButton`, tooltip, `PageHeader`, `Toolbar`,
   `StatCard`, AppShell (ixcham), prefetch, `manualChunks`, React Query sozlamalari, `SortableList`, `DropZone`,
   `CommandPalette`.
2. Bo'limlar (parallel, fayllar kesishmaydi): Buyurtmalar · Katalog (+ backend tartib endpointi) ·
   To'lovlar/Ombor/Mijozlar/Debitorlik/Xodimlar/Login.
3. Tekshiruv: `pnpm --filter @mebel/admin typecheck`, admin vitest, `pnpm test:api`, `packages/shared` testlari,
   250 qator tekshiruvi, `vite build` (chunk o'lchamlari), brauzerda yorug'/qorong'i va tor ekran.
