# 05. Ochiq savollar

Har bir savolga **default** taxmin yozilgan. Javob berilmasa, shu bilan davom etiladi.

| # | Savol | Default |
|---|---|---|
| 1 | Raspil va kromkalash xizmati bormi? Narx qanday hisoblanadi? | Bor. Kesish 1 metri uchun X so'm, kromkalash 1 metri uchun Y so'm (kromka materiali alohida). 2-bosqichda |
| 2 | Nasiya beriladimi? Kredit limitidan oshsa bloklansinmi yoki faqat ogohlantirilsinmi? | Beriladi, faqat admin belgilagan mijozlarga. Oshsa ogohlantirish chiqadi, menejer tasdiqlab o'tkaza oladi |
| 3 | Narxlar so'mdami yoki dollarda (kurs bo'yicha)? | So'mda. Kurs o'zgarsa admin ommaviy narx o'zgartirish bilan yangilaydi |
| 4 | Nechta ombor yoki filial bor? Qoldiq har ombor bo'yicha alohida yuritiladimi? | 1 ta ombor va qoldiq bitta. Olib ketish nuqtalari bir nechta bo'lishi mumkin |
| 5 | Mijozga qoldiq aniq son bilan ko'rsatilsinmi? | "Bor / kam qoldi / yo'q", aniq son ko'rsatilmaydi |
| 6 | Ro'yxatdan o'tmagan foydalanuvchi narxni ko'radimi? | Ko'radi (chakana). Guruh narxi login qilgandan keyin ko'rinadi |
| 7 | Omborda yo'q (ON_ORDER) mahsulotga buyurtma qabul qilinsinmi? | Ha, muddat ko'rsatiladi, rezerv qilinmaydi |
| 8 | Yetkazish: o'z mashinalaringizmi yoki yollanadimi? Shahar zonalari bormi? | O'z haydovchilari. Toshkent zonalari bo'yicha narxni admin kiritadi |
| 9 | Mahsulotlar hozir qayerda saqlanadi (Excel, 1C, daftar)? 1C bilan integratsiya kerakmi? | Excel'dan import qilinadi, 1C integratsiyasi yo'q |
| 10 | Fiskal chek yoki OFD talabi bormi? | MVP'da yo'q. Click/Payme bilan 3-bosqichda ko'rib chiqiladi |
| 11 | Haydovchi uchun alohida app kerakmi? | Yo'q. Bitta app, rolga qarab boshqa navigatsiya ochiladi |
| 12 | SMS provayder va hosting | Eskiz.uz. Hosting: bitta VPS + Docker (deploy'ni oxirida kelishamiz) |
| 13 | Tillar: o'zbek lotin + rus. O'zbek kirill ham kerakmi? | Kerak emas |
| 14 | Firma nomi, logo, asosiy rang | Vaqtincha "Mebel Order" nomi va neytral dizayn |
| 15 | Hajm: taxminan nechta mahsulot (SKU) bor va kuniga nechta buyurtma tushadi? | ~2 000 SKU, kuniga ~100 buyurtma. Hozirgi arxitektura bundan 10 baravar ko'pini ko'taradi |
