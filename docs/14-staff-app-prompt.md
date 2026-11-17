# Xodimlar ilovasi (APK) va admin panelning telefon versiyasi (prompt)

Menejer, omborchi va super admin admin panelning **barcha** funksiyalaridan telefonda ham foydalanadi.
Mijozlar ilovasidan alohida ilova: **Mebel Order Xodim** (`apps/staff`).

## Arxitektura

- **Yagona manba — `apps/admin`.** Admin panel telefon ekraniga to'liq moslashtiriladi; xodim ilovasi va web bir xil
  koddan ishlaydi (DRY: ikki nusxa yo'q, har funksiya bir marta yoziladi).
- **`apps/staff` — Expo ilovasi**, native qobiq: splash, ikonka, Android "orqaga" tugmasi, xavfsiz hududlar,
  fayl tanlash (rasm, chek, Excel) va yuklab olish (eksport, akt-sverka), tarmoq yo'q holati. Ichida — admin panel
  (`react-native-webview`, manzil `EXPO_PUBLIC_ADMIN_URL`). Admin yangilansa — ilova darhol yangi versiyani ko'radi.
- Server: `app: "admin"` o'zgarmaydi — xodim ilovasi admin panel orqali kiradi; mijoz ilovasi faqat mijoz/haydovchi.

## Admin — telefon dizayni (`< lg`)

1. **Pastki tab bar** (CLAUDE.md): rolga mos bo'limlar, 5 tadan ko'p bo'lsa — "Yana" varag'i; faol band duotone.
   Yuqori panel ixcham: qidiruv (⌘K), til, mavzu, profil. Xavfsiz hudud (`env(safe-area-inset-*)`).
2. **Jadvallar → kartalar** (`< sm`): `DataTable` har qatorni karta qilib chizadi; `hideBelow` ustunlar yashirin.
3. **Dialoglar → pastdan chiqadigan varaq** (`< sm`), to'liq kenglik, yuqori burchaklar yumaloq.
4. **Bosish maydoni** — sensorli ekranda (`pointer: coarse`) kamida 40px.
5. **DnD sensorli ekranda:** sichqoncha — 4px siljish; barmoq — 250 ms bosib turish (aylantirish buzilmaydi).
6. **Sahifalar:** filtrlar bir qatorda gorizontal aylanadi; kanban — ekranga bitta ustun (snap); buyurtma sahifasida
   asosiy amallar pastki yopishgan panelda; bosqichlar telefonga sig'adi.

## Tekshiruv

Typecheck, vitest, 250 qator; brauzerda 390px va 1280px, yorug'/qorong'i; `apps/staff` — `expo-doctor`, EAS build.
