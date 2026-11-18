# Rollar va ruxsatlar — web va ilovalar (prompt)

Maqsad: har bir rol **faqat o'z ishini** ko'radi va qiladi, lekin o'z ishini **to'liq** qila oladi. Qoida bitta joyda
yoziladi, server va barcha frontendlar undan foydalanadi; har o'zgarish test bilan ushlanadi.

## Rollar va ilovalar

| Rol | Kimligi | Qayerdan kiradi | Asosiy ishi |
|---|---|---|---|
| `CUSTOMER` | Usta, sex, firma | Mebel Order (ilova va web) | Katalog, savat, buyurtma, to'lov, chat, akt-sverka |
| `DRIVER` | Haydovchi | Mebel Order ilovasi (haydovchi ekranlari) | O'ziga biriktirilgan yetkazishlar: yo'lga chiqish, topshirish (foto, naqd), yetkazilmadi |
| `WAREHOUSE` | Omborchi | Admin panel / Mebel Xodim | Qabul qilingan buyurtmani yig'ish → tayyor, olib ketishda topshirish, kirim/inventarizatsiya |
| `MANAGER` | Menejer | Admin panel / Mebel Xodim | Buyurtmani qabul qilish (shartlar), haydovchi, to'lovlar, mijozlar, katalog |
| `SUPER_ADMIN` | Rahbar | Admin panel / Mebel Xodim | Hammasi + xodimlar, narx guruhlari, ommaviy narx, o'chirish, ledger tuzatish, qaytarish |

Noto'g'ri ilovaga kirishda aniq yo'l-yo'riq: haydovchi va mijoz admin panelda — "Mebel Order ilovasidan kiring";
xodim mijoz ilovasida — "Mebel Xodim / admin paneldan kiring".

## Ruxsatlar matritsasi (yagona manba)

`packages/shared/src/permissions.ts` ↔ `apps/api-py/app/auth/permissions.py` (testda solishtiriladi).

| Ruxsat | CUSTOMER | DRIVER | WAREHOUSE | MANAGER | SUPER_ADMIN |
|---|:-:|:-:|:-:|:-:|:-:|
| `orders.view` — xodim buyurtmalar ro'yxati, kanban, sahifa | | | ✓¹ | ✓ | ✓ |
| `orders.manage` — shartlar, menejer, haydovchi biriktirish | | | | ✓ | ✓ |
| `orders.finance` — to'lovlar, mijoz balansi va krediti buyurtmada | | | | ✓ | ✓ |
| `orders.chat` — mijoz bilan chat (xodim tomoni) | | | | ✓ | ✓ |
| `orders.override` — avansni chetlab o'tib qabul, raspil boshlangan buyurtmani bekor qilish | | | | | ✓ |
| `payments.manage` — to'lovlar navbati, tasdiqlash, kiritish | | | | ✓ | ✓ |
| `payments.adjust` — ledger tuzatish, pul qaytarish | | | | | ✓ |
| `catalog.view` | | | ✓ | ✓ | ✓ |
| `catalog.edit` — mahsulot, variant, rasm, kategoriya, brend, import/eksport | | | | ✓ | ✓ |
| `catalog.delete` — mahsulot/variant o'chirish | | | | | ✓ |
| `prices.manage` — narx guruhlari, ommaviy narx o'zgartirish | | | | | ✓ |
| `stock.manage` — qoldiq, kirim, inventarizatsiya | | | ✓ | ✓ | ✓ |
| `customers.manage` — mijozlar, akt-sverka, debitorlik | | | | ✓ | ✓ |
| `staff.manage` — xodimlar | | | | | ✓ |

¹ Omborchi faqat **qabul qilingan** buyurtmalarni ko'radi (Yig'ilmoqda, Tayyor, Yo'lda); yangi, yakunlangan va bekor
qilinganlar — menejer ishi. Buyurtma sahifasida unga moliya (to'lovlar, mijoz balansi, kredit) berilmaydi.

Holat o'tishlari alohida — `docs/02-state-machine.md` (kim qaysi statusdan qaysiga). Ruxsat "sahifani ko'radi",
state machine "qaysi tugma" ni hal qiladi; tugmalar server bergan `availableTransitions` dan chiziladi.

## Topilgan muammolar (tekshiruv natijasi)

1. **Omborchi buyurtmalarni ko'rmaydi:** menyuda "Buyurtmalar" bor, lekin `GET /admin/orders`, `/kanban`, `/{id}` —
   faqat menejer. Omborchining asosiy ishi (yig'ish → tayyor) admin panelda ishlamaydi.
2. **Ma'lumot oqishi:** omborchi holat o'tkazganda javobda to'liq buyurtma (mijoz balansi, to'lovlar) qaytadi —
   o'qish yopiq, yozish javobi ochiq.
3. **Rol ro'yxatlari 13+ joyda qo'lda** (`can('SUPER_ADMIN')`, `MANAGERS`, router'larda `require_roles(...)`) —
   bitta qoida o'zgarsa hamma joyni topish kerak.
4. **Noto'g'ri ilovaga kirish xabari** umumiy ("kirib bo'lmaydi") — qayerdan kirish kerakligini aytmaydi.
5. **Jonli kanal orqali oqish:** "staff" xonasiga barcha xodimlar (haydovchi, omborchi ham) qo'shilardi — mijoz
   chati va to'lov hodisalari ularning qurilmasiga yetib borardi. Endi: menejerlar xonasi (chat, to'lov, shartlar) va
   buyurtma ko'ruvchilar xonasi (faqat holat o'zgarishi — omborchi kanbani jonli yangilanadi).
6. Kod ichida qattiq yozilgan `role == "SUPER_ADMIN"` tekshiruvlari (kredit limiti, avansni chetlab o'tish) — ruxsatga.
7. Ruxsatlar uchun test yo'q: yangi endpoint ochiq qolsa yoki rol tasodifan o'zgarsa — hech narsa ushlamaydi.

## Bajarish

1. **Shared:** `permissions.ts` — `PERMISSIONS: Record<Permission, Role[]>`, `hasPermission(role, p)`; testlar.
2. **Backend:** `app/auth/permissions.py` (xuddi shu jadval) + `require(permission)` dependency; router'lar
   ruxsat nomi bilan (`Annotated[AuthUser, Depends(require("orders.view"))]`).
   - Omborchi: ro'yxat/kanban/sahifa — faqat `WAREHOUSE_STATUSES`; boshqasi 404. Sahifa va o'tish javobida
     moliya maydonlari bo'sh (`payments: []`, balans/kredit `null`, `creditCheck: null`).
   - Login: rolga qarab aniq xabar (`USE_CUSTOMER_APP` / `USE_ADMIN_PANEL`).
3. **Admin:** `useAuth().can('orders.manage')` — rol emas, ruxsat; menyu (`nav.ts`), sahifa himoyasi, tugmalar,
   buyruqlar palitrasi shu bilan. Omborchida buyurtmalar sahifasida "menejer" filtri yo'q.
4. **Mobil:** haydovchi/mijoz ekranlari (`Stack.Protected`) — o'zgarmaydi, tekshiriladi.
5. **Testlar:**
   - `tests/test_permissions.py` — **har bir endpoint** uchun ruxsat etilgan rollar jadvali (snapshot): yangi endpoint
     yoki o'zgargan rol testni yiqitadi, ataylab yangilanadi. Har rol uchun haqiqiy so'rov (401/403/200).
   - Omborchi: ko'radigan statuslar, moliya yashirin, NEW — 404; haydovchi faqat o'ziniki.
   - Shared ↔ Python jadvali bir xil.
6. **Tekshiruv:** pytest, vitest, typecheck, 250 qator; brauzerda har rol bilan (super admin, menejer, omborchi;
   mijoz va haydovchi — Expo web).
