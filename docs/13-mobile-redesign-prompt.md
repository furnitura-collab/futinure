# Mobil ilova va mijoz sayti — umumiy talablar bo'yicha redizayn (prompt)

`docs/12-admin-pro-redesign-prompt.md` dagi umumiy talablar mobil ilovaga ham qo'llanadi. Ilova `apps/mobile` (Expo):
bitta kod — Android APK (mijoz, haydovchi) va web versiya (kompyuterda mijoz uchun sayt ko'rinishi, `components/web`).
Omborchi va menejer — admin panelda.

## 0. Cheklovlar

- **Faqat JS/UI o'zgarishi** — yangi native modul qo'shilmaydi, `app.json` plugin va versiya o'zgarmaydi. Shunda
  o'zgarishlar EAS Update (OTA) bilan yetkaziladi, APK qayta o'rnatilmaydi (CLAUDE.md).
- Hermes: brauzerdagi har API yo'q — yangi `Intl`/brauzer API'sidan oldin tekshiriladi.
- Web va native bir xil komponentlar; farq faqat `useLayout().wide` va `Platform.OS === 'web'` orqali.

## 1. Poydevor (bajarildi)

- Rang: yorqin purple (`#7c3aed` / qorong'ida `#a78bfa`), neytrallar yengil purple tusli, `violet` tone — indigo.
- Ikonkalar: **Phosphor** (admin bilan bir xil). Shrift sifatida (`expo-font`), faqat ishlatiladigan glif'lar:
  `scripts/icons.txt` → `uv run --with fonttools python scripts/build_icons.py` → `assets/fonts/phosphor-*.ttf` va
  `src/components/ui/glyphs.ts`. Og'irlik: `regular`, faol holat — `fill`.

## 2. Ekranlar uchun talablar

- **Ikonka yoki matn.** Ma'noli amal — faqat ikonka (`IconButton`, `accessibilityLabel`; web'da `title`
  tooltip). Asosiy CTA — faqat matn. Bezak ikonkalar olib tashlanadi. Pastki tab bar — istisno (ikonka + nom).
- **Minimalizm va zichlik.** Takroriy sarlavha/izoh yo'q; kartalar orasi `space(3)`–`space(4)`; bir ekranda bitta asosiy amal.
- **Glass.** Sarlavha, tab bar, sheet — `GlassView`; kartalar — `Card` (blur'siz, tez).
- **Oddiy foydalanuvchi uchun.** Holatlar so'z bilan emas, aniq bosqich bilan (buyurtma bosqichlari), raqamlar katta va aniq.
- **DRY.** Umumiy qismlar `components/ui` va bo'lim papkalarida; har fayl ≤ 250 qator; kodni takrorlovchi kommentlar yo'q.

## 3. Bo'limlar

1. Bosh sahifa, katalog, mahsulot, savat, buyurtma berish (checkout).
2. Buyurtmalar, buyurtma sahifasi, chat, to'lov, balans, bildirishnomalar.
3. Profil, sozlamalar, manzillar, kirish/ro'yxatdan o'tish, parol; haydovchi ekranlari; web sarlavha/qobiq.

## 4. Tekshiruv

`pnpm --filter @mebel/mobile typecheck`, `packages/shared` testlari, 250 qator, Expo web'da yorug'/qorong'i,
tor (telefon) va keng (kompyuter) ko'rinish. Telefonga yetkazish — `pnpm ota "izoh"` (foydalanuvchi ruxsati bilan).
