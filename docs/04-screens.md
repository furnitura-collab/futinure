# 04. Ekranlar

Bosqich belgisi: **[1]** MVP, **[2]** 2-bosqich, **[3]** 3-bosqich.

## Mijoz ilovasi (React Native / Expo)

### Kirish
1. **Splash / til tanlash** [1]
2. **Telefon raqam** [1] → **SMS kod** [1]
3. **Profilni to'ldirish** [1]: ism, turi (usta / firma / oddiy). Firma bo'lsa: nomi, STIR

### Asosiy (pastki tab: Katalog · Qidiruv · Savat · Buyurtmalar · Profil)
4. **Bosh sahifa / Katalog** [1]: kategoriyalar, "tez-tez oladiganlarim", yangi kelganlar
5. **Kategoriya → mahsulotlar ro'yxati** [1]: filtrlar (brend, qalinlik, rang, omborda bor), saralash
6. **Mahsulot sahifasi** [1]: rasmlar, rang/dekor namunalari, variant tanlash, **shaxsiy narx**, pog'onali narx jadvali ("50+ list: 285 000"), qoldiq holati, miqdor (+/- qadam bilan), "Savatga", sevimli
7. **Qidiruv** [1]: nom/SKU, oxirgi qidiruvlar
8. **SKU bo'yicha tez buyurtma** [1]: artikul + miqdor qatorlari
9. **Savat** [1]: qatorlar, miqdor validatsiyasi, qoldiq ogohlantirishi, jami og'irlik, summa
10. **Raspil kartasi** [2]: plita tanlash → detallar jadvali (uzunlik × eni × soni, kromka tomonlari) / Excel yuklash → taxminiy hisob
11. **Rasmiylashtirish** [1]: dostavka yoki olib ketish → manzil (xarita) yoki ombor → sana/slot [2] → izoh → "Yuborish". To'lov bu yerda **tanlanmaydi**, menejer bilan kelishiladi (yoki doimiy mijozning standart sharti ko'rsatiladi)
12. **Buyurtma yuborildi** [1]: raqam, "menejer tez orada ko'rib chiqadi"

### Buyurtmalar
13. **Buyurtmalar ro'yxati** [1]: faol / tarix, status belgilari, "Taklif keldi" badge
14. **Buyurtma sahifasi** [1]:
    - status timeline (tarix bilan)
    - tarkib, summalar: jami / to'langan / qoldiq
    - yetkazish ma'lumoti
    - to'lov yo'riqnomasi (karta raqami, nusxalash) + "Chek yuklash"
    - "Chat" tugmasi, "Qayta buyurtma", "Bekor qilish" (NEW/QUOTED)
15. **Taklifni ko'rish** [1]: o'zgarishlar diff ko'rinishida (eski → yangi miqdor/narx, analog mahsulot rasmi bilan), yetkazish narxi, to'lov shartlari, muddat taymer → "Qabul qilaman" / "Rad etaman + izoh"
16. **Chek yuklash** [1]: summa, usul, rasm (kamera/galereya)
17. **Chat** [1]: matn, rasm, fayl, o'qildi belgisi
18. **Yetkazishni kuzatish** [2]: haydovchi ismi, telefoni, holat

### Profil
19. **Profil** [1]: ma'lumotlar, til, manzillar, chiqish
20. **Mening hisobim** [1]: balans (qarz/haqdor), kredit limiti, muddati o'tgan summa, ledger ro'yxati, "Qarzni to'lash", akt-sverka PDF [2]
21. **Manzillar** [1]: ro'yxat, xaritadan qo'shish
22. **Sevimlilar** [1]
23. **Bildirishnomalar** [1]

## Admin panel (Next.js, web)

Chap menyu rolga qarab ko'rinadi.

1. **Kirish** [1]: telefon + OTP
2. **Dashboard** [1]: bugungi buyurtmalar, tasdiq kutayotgan to'lovlar, javob kutayotgan yangi buyurtmalar (timer bilan), kam qoldiqlar, debitorlik qarzi. [2] grafiklar
3. **Buyurtmalar — Kanban** [1]: ustunlar = statuslar, kartochka (raqam, mijoz, summa, vaqt, qarz belgisi), real-time + ovozli signal, drag-and-drop **yo'q** (o'tishlar faqat tugma va tasdiq bilan)
4. **Buyurtmalar — Jadval** [1]: filtrlar, qidiruv, Excel eksport
5. **Buyurtma sahifasi** [1]:
   - chap: tarkib (inline miqdor tahrirlash, "analog bilan almashtirish" qidiruvi, qoldiq ko'rsatkichi), raspil kartalari [2]
   - o'ng: mijoz kartasi (balans, limit, guruh, oldingi buyurtmalar soni), harakat tugmalari (faqat ruxsat etilgan o'tishlar), to'lovlar, menejer/haydovchi biriktirish
   - pastda tablar: Chat · Tarix · Takliflar · Audit
   - PDF: schyot, nakladnoy [2], raspil kartasi [2]
6. **Taklif tuzish (modal/drawer)** [1]: o'zgarishlar preview, yetkazish narxi (avtomatik hisob + tahrir), sana, to'lov shartlari, avans, ruxsat etilgan usullar, izoh → yuborish
7. **To'lovlar** [1]: PENDING navbati (chek rasmi katta ko'rinishda, tasdiqlash/rad etish), barcha to'lovlar
8. **Katalog** [1]: kategoriyalar daraxti, brendlar, mahsulotlar jadvali, mahsulot formasi (variantlar jadvali, rasmlar drag-drop, pog'onali va guruh narxlari)
9. **Excel import** [1]: fayl → dry-run natijasi (yangi / yangilanadi / xatolar qatorma-qator) → tasdiqlash
10. **Ommaviy narx o'zgartirish** [1]: filtr → foiz → yaxlitlash → preview jadvali → tasdiq
11. **Ombor** [1]: qoldiqlar, kirim kiritish, inventarizatsiya tuzatish, harakatlar tarixi, kam qoldiqlar
12. **Mijozlar** [1]: ro'yxat (qarzdorlar filtri), mijoz sahifasi: profil, guruh, limit, ledger, akt-sverka [2]
13. **Hisobotlar** [2]: savdo, top mahsulotlar, debitorlik, menejerlar javob tezligi
14. **Sozlamalar** [1/2]: xodimlar, narx guruhlari, omborlar, to'lov ma'lumotlari, Telegram [2], yetkazish zonalari (xaritada polygon chizish) [2], slotlar [2], mashina turlari [2], raspil tariflari [2]
15. **Audit log** [1]

## Omborchi (admin panelning soddalashtirilgan ko'rinishi, planshetga moslangan) [1]
1. **Vazifalar**: CONFIRMED (boshlash kerak) va PREPARING (jarayonda)
2. **Yig'ish ro'yxati**: qatorlar, belgilash checkbox'lari, raspil kartasi [2] → "Tayyor"
3. **Topshirish** (PICKUP): qabul qiluvchi ismi → "Topshirildi"

## Haydovchi (mijoz ilovasining o'zi, DRIVER roli bilan kirganda boshqa navigatsiya) ✅
1. **Bugungi yetkazishlar**: tartib, manzil, og'irlik, naqd olinadigan summa
2. **Yetkazish sahifasi**: xarita/navigatorda ochish, mijozga qo'ng'iroq, "Yo'lga chiqdim"
3. **Topshirish**: foto, qabul qiluvchi ismi, naqd olindi (summa) → "Topshirildi" yoki "Yetkazib bo'lmadi + sabab" (tez sabablar: telefonni ko'tarmadi, manzilda yo'q, …)

Admin: buyurtma sahifasida "Haydovchi" kartasi — biriktirish, sana, natija (qabul qilgan, naqd, surat).
