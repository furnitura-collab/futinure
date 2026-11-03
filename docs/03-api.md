# 03. API endpointlar

Asos: `/api/v1`. Auth: `Authorization: Bearer <access JWT>` (15 daqiqa) + refresh token (30 kun, rotatsiya).
Xatolar formati: `{ "error": { "code": "INSUFFICIENT_STOCK", "message": "...", "details": {...} } }`.
Ro'yxatlar: `?page=&limit=` → `{ items, total, page, limit }` (katalog hajmi kichik, offset yetarli).
To'liq sxema: `/api/docs` (OpenAPI, zod sxemalardan generatsiya).

## Auth
| Metod | Yo'l | Izoh |
|---|---|---|
| POST | `/auth/otp/request` | `{ phone }` — SMS yuboradi. Limit: 1 daqiqada 1 ta, soatda 5 ta |
| POST | `/auth/otp/verify` | `{ phone, code }` → `{ accessToken, refreshToken, user }`. Yangi raqam bo'lsa CUSTOMER yaratiladi |
| POST | `/auth/refresh` | |
| POST | `/auth/logout` | refresh tokenni bekor qiladi |
| GET / PATCH | `/me` | profil, til, yuridik ma'lumotlar |
| POST / DELETE | `/me/devices` | push token |

## Katalog (mijoz, login ixtiyoriy)
| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/categories` | daraxt |
| GET | `/brands` | |
| GET | `/products` | `?categoryId&brandId&q&inStock&sort&page&limit`. `sort`: popular, price_asc, price_desc, name, new. Qidiruv xato yozuvga chidamli (4+ harf) |
| GET | `/products/:id` | variantlar, rasmlar, mijozning **shaxsiy narxi** (guruh/pog'ona). Qoldiq son emas, daraja: IN_STOCK / LOW / ON_ORDER / OUT_OF_STOCK |
| GET | `/variants/by-sku/:sku` | SKU bo'yicha tez qo'shish |
| POST | `/pricing/quote` | `{ items: [{variantId, qty}] }` → har qator narxi, og'irlik/hajm va muammolar (`issues`: qadam, minimal, qoldiq yetmaydi, tugagan, nofaol) |

## Savat va sevimlilar
| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/cart` | joriy narx, qoldiq ogohlantirishlari bilan |
| PUT | `/cart/items/:variantId` | `{ qty }` — miqdorni o'rnatadi. Qoidaga zid miqdor (min/qadam) → 422, tugagan/nofaol → 409. Qoldiqdan ko'p — saqlanadi, `EXCEEDS_AVAILABLE` ogohlantirish bilan |
| POST | `/cart/items/bulk` | `{ items: [{ sku, qty }] }` — SKU bo'yicha tez qo'shish, mavjud miqdorga qo'shiladi, har SKU natijasi alohida |
| DELETE | `/cart/items/:variantId` | |
| DELETE | `/cart` | tozalash |
| POST | `/cart/reorder/:orderId` | eski buyurtmani savatga → `{ cart, added: [{sku, oldUnitPrice, newUnitPrice}], skipped }` |
| GET / POST / DELETE | `/favorites`, `/favorites/:productId` | |

## Manzillar va yetkazish
| Metod | Yo'l | Izoh |
|---|---|---|
| CRUD | `/addresses` | |
| GET | `/warehouses` | olib ketish nuqtalari |
| POST | `/delivery/estimate` | `{ addressId \| lat,lng }` + savat → zona, mashina turi, narx |
| GET | `/delivery/slots?date=` | bo'sh slotlar |

## Raspil
| Metod | Yo'l | Izoh |
|---|---|---|
| POST | `/cutting/estimate` | `{ boardVariantId, parts[] }` → listlar soni, kesish/kromka metri, taxminiy narx |
| POST | `/cutting/import` | Excel fayl → `parts[]` (shablon: `/cutting/template.xlsx`) |

## Buyurtmalar (mijoz)
| Metod | Yo'l | Izoh |
|---|---|---|
| POST | `/orders` | Header `Idempotency-Key` (8–64 belgi, majburiy). Body: `{ deliveryType, addressId \| warehouseId, deliveryDate?, comment? }`. Tovarlar **server savatidan** olinadi (mijoz narx yubora olmaydi). Yangi → 201; shu kalit bilan takror → 200 + `Idempotent-Replayed: true`. Savatda to'sqinlik qiluvchi muammo → 409 `CART_HAS_ISSUES`. Ism kiritilmagan → 422 `PROFILE_INCOMPLETE` |
| GET | `/orders` | `?status&active=true\|false&page&limit` |
| GET | `/orders/:id` | tarkib, summalar (`balanceDue`), to'lovlar, tarix, `pendingQuote` (javob kutayotgan taklif, eski → yangi qatorlar bilan) |
| POST | `/orders/:id/cancel` | `{ reason }` — faqat NEW/QUOTED |
| GET | `/orders/:id/quotes` | barcha versiyalar |
| POST | `/orders/:id/quotes/:quoteId/accept` | → CONFIRMED + tovar band qilinadi. Tovar tugab qolgan bo'lsa 409 `INSUFFICIENT_STOCK`, buyurtma QUOTED da qoladi |
| POST | `/orders/:id/quotes/:quoteId/reject` | `{ comment }` |
| POST | `/uploads/receipts` | multipart `file` (JPG/PNG/WEBP/PDF, 10 MB) → `{ id }`. Yopiq saqlanadi |
| POST | `/orders/:id/payments` | `{ amount, method: CARD_TRANSFER\|BANK_TRANSFER, receiptUploadId, comment? }` → PENDING. Faqat CONFIRMED dan keyin, kelishilgan usul bilan, qoldiqdan (kutilayotganlar hisobga olinib) oshmasin. Bir vaqtda ko'pi bilan 5 ta kutilayotgan |
| GET | `/payments/:id/receipt` | chek fayli — egasi yoki menejer |
| GET | `/orders/:id/messages` | `?before=<messageId>&limit` → `{ items (eskidan yangiga), hasMore }`. Mijoz va menejer bir xil yo'ldan |
| POST | `/orders/:id/messages` | `{ text?, attachmentUploadId? }` (fayl avval `/uploads/chat` ga) |
| POST | `/orders/:id/messages/read` | qarshi tomon xabarlarini o'qilgan qiladi. Ro'yxatlarda `unreadMessages` |
| GET | `/chat/messages/:id/attachment` | ilova fayli — faqat shu buyurtma ishtirokchilari |

## Moliya (mijoz)
| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/me/balance` | balans (musbat — qarz, manfiy — haqdor), kredit limiti, bo'sh limit, muddati o'tgan summa, tekshirilayotgan to'lovlar |
| GET | `/me/ledger?from&to&page&limit` | |
| GET | `/me/payments` | o'z to'lovlari va holati |
| GET | `/me/reconciliation?from&to` | akt-sverka (JSON): boshlang'ich qoldiq, yozuvlar, debet/kredit aylanma, yakuniy qoldiq. PDF — 2-bosqich |
| POST | `/me/payments` | umumiy qarzga to'lov (buyurtmasiz). Tasdiqlanganda eng eski to'lanmagan buyurtmalarga taqsimlanadi (FIFO) |
| GET | `/payment-info` | P2P karta raqami, bank rekvizitlari |

## Fayllar va bildirishnomalar
| Metod | Yo'l | Izoh |
|---|---|---|
| POST | `/uploads` | `{ purpose, contentType }` → presigned URL + uploadId. Turi va hajmi cheklangan |
| GET | `/notifications` | `{ items, total, unread }` |
| POST | `/notifications/read` | `{ ids[] }` yoki `{ all: true }` |

---

## Admin panel (`/admin/*`, rol: MANAGER, SUPER_ADMIN; ba'zilari faqat SUPER_ADMIN — ★)

### Buyurtmalar
| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/admin/orders` | `?status&managerId=<id>\|none&customerId&q&from&to&page&limit`. `q` — raqam, ism, firma yoki telefon |
| GET | `/admin/orders/kanban` | faol statuslar bo'yicha ustunlar: `[{ status, total, items }]`, eng uzoq kutayotgan birinchi |
| GET | `/admin/orders/managers` | biriktirish uchun menejerlar |
| GET | `/admin/orders/:id` | to'liq + har qatorda qoldiq holati (`stock.shortage`), `creditCheck`, `availableTransitions`, takliflar, tarix (kim qilgan) |
| PATCH | `/admin/orders/:id/assign` | `{ managerId \| null }`. Versiyani oshirmaydi — mijozdagi taklif eskirmaydi |
| POST | `/admin/orders/:id/quotes` | `{ paymentTerms, advanceAmount, allowedMethods, deliveryFee, discountTotal, deliveryDate?, itemChanges[{itemId, qty, unitPrice?}], replacements[{itemId, variantId, qty, unitPrice?}], additions[{variantId, qty, unitPrice?}], note?, expiresInHours?, expectedVersion? }` → `{ quote, warnings, order }`. NEW → QUOTED; QUOTED bo'lsa eski taklif SUPERSEDED |
| POST | `/admin/orders/:id/transition` | `{ to, comment?, expectedVersion?, terms? (NEW→CONFIRMED uchun), overrideCreditLimit?, overrideAdvance?, receiverName? (olib ketishda) }`. Omborchi va haydovchi ham ishlatadi — ruxsatni state machine tekshiradi |
| GET | `/admin/orders/:id/documents/:type.pdf` | `invoice` (schyot), `waybill` (nakladnoy), `cutting-card` — 2-bosqich |

### To'lovlar
| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/admin/payments?status=PENDING` | tasdiq kutayotganlar |
| POST | `/admin/payments` | `{ customerId, orderId?, amount, method, comment? }` — menejer qabul qilgan pul, darhol CONFIRMED |
| POST | `/admin/payments/:id/confirm` | |
| POST | `/admin/payments/:id/reject` | `{ reason }` |

### Katalog va ombor
| Metod | Yo'l | Izoh |
|---|---|---|
| CRUD | `/admin/categories`, `/admin/brands` | |
| CRUD | `/admin/products`, `/admin/products/:id/variants`, `/admin/variants/:id` | `?lowStock=true` filtri. O'chirish ★ — faqat buyurtmada ishlatilmagan bo'lsa |
| POST / DELETE | `/admin/products/:id/images`, `/admin/products/:id/images/:imageId` | `{ url }` — avval `/admin/uploads/images` ga yuklanadi |
| PUT | `/admin/products/:id/images/order` | `{ ids[] }` — tartib |
| POST | `/admin/uploads/images` | multipart `file`: JPG/PNG/WEBP, 5 MB → `{ url }` |
| GET | `/admin/variants/:id/price-history` | |
| CRUD | `/admin/price-groups` | o'zgartirish ★ |
| PUT | `/admin/variants/:id/price-tiers` | |
| PUT | `/admin/variants/:id/group-prices` | |
| POST | `/admin/catalog/import` | multipart `file` (.xlsx, 10 MB). Default dry-run: hisobot (qo'shiladi/yangilanadi/xato qator raqami bilan). `?commit=true` — saqlaydi; xato bo'lsa hech narsa saqlanmaydi. Format: eksport faylining "Yo'riqnoma" varag'i |
| GET | `/admin/catalog/export.xlsx` | |
| POST | `/admin/prices/bulk-update` ★ | `{ categoryId?, brandId?, percent, roundTo: 1\|100\|500\|1000, includeTiers, includeGroupPrices, dryRun=true }` |
| POST | `/admin/stock/movements` | `{ type: IN, variantId, qty }` yoki `{ type: ADJUST, variantId, actualQty, reason }` (inventarizatsiya: sanalgan haqiqiy qoldiq). Omborchi ham qila oladi |
| GET | `/admin/stock/low` | |
| GET | `/admin/stock/variants/:id/movements` | |

### Mijozlar
| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/admin/customers` | filtr: guruh, qarzdorlar, muddati o'tganlar |
| GET | `/admin/customers/:id` | profil, balans, buyurtmalar |
| PATCH | `/admin/customers/:id` | guruh, turi, firma, STIR, to'lov usullari, bloklash (sessiyalar yopiladi); kredit limiti va muddat ★ |
| GET | `/admin/customers/:id/ledger` | |
| POST | `/admin/customers/:id/ledger/adjust` ★ | qo'lda tuzatish, izoh majburiy |
| GET | `/admin/customers/:id/reconciliation` | JSON |
| POST | `/admin/customers/:id/refunds` ★ | `{ amount, method, description }` — mijoz haqdor bo'lsa pul qaytarish |

### Sozlamalar ★
| Metod | Yo'l |
|---|---|
| CRUD | `/admin/staff` (xodimlar, rollar) |
| CRUD | `/admin/price-groups`, `/admin/warehouses`, `/admin/delivery-zones`, `/admin/delivery-slots`, `/admin/vehicle-types` |
| GET / PUT | `/admin/settings` |
| GET | `/admin/audit-logs` |

### Hisobotlar
| Metod | Yo'l |
|---|---|
| GET | `/admin/reports/dashboard?from&to` — savdo, o'rtacha chek, konversiya, javob vaqti |
| GET | `/admin/reports/top-products` |
| GET | `/admin/reports/receivables` — debitorlik, muddati o'tganlar |

## Omborchi (`/warehouse/*`, rol: WAREHOUSE)
| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/warehouse/tasks` | CONFIRMED/PREPARING buyurtmalar, picking list |
| POST | `/warehouse/orders/:id/start` | → PREPARING |
| POST | `/warehouse/cutting-lists/:id/done` | |
| POST | `/warehouse/orders/:id/ready` | → READY |
| POST | `/warehouse/orders/:id/handover` | PICKUP → DELIVERED, `{ receiverName }` |

## Haydovchi (`/driver/*`, rol: DRIVER)
| Metod | Yo'l | Izoh |
|---|---|---|
Haydovchi faqat o'ziga biriktirilgan buyurtmani ko'radi va o'zgartiradi (boshqasi — 404; `/admin/orders/:id/transition` uchun ham). Narxlar ko'rsatilmaydi — faqat `toCollect` (nasiyada 0).

| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/driver/deliveries` | `{ today, active[], done[] }`: faol (CONFIRMED…OUT_FOR_DELIVERY, reja sanasi bo'yicha) va bugun topshirilganlar |
| GET | `/driver/deliveries/:orderId` | + tovarlar ro'yxati |
| POST | `/driver/deliveries/:orderId/start` | `{ expectedVersion? }` READY → OUT_FOR_DELIVERY, delivery `IN_TRANSIT` |
| POST | `/driver/uploads/proof` | multipart `file` — topshirish surati (yopiq fayl) |
| POST | `/driver/deliveries/:orderId/deliver` | `{ receiverName, proofUploadId?, cashCollected?, comment?, expectedVersion? }` → DELIVERED. Naqd pul — `PENDING` CASH to'lov (kassaga topshirilganda menejer tasdiqlaydi). Hammasi bitta tranzaksiyada |
| POST | `/driver/deliveries/:orderId/fail` | `{ reason }` → READY (tovar omborga qaytadi), delivery `FAILED`; mijozga va Telegram'ga xabar |

Menejer:

| Metod | Yo'l | Izoh |
|---|---|---|
| GET | `/admin/drivers` | faol haydovchilar + faol yetkazishlar soni |
| PUT | `/admin/orders/:id/delivery` | `{ driverId \| null, scheduledDate?, slot?, vehicleType? }` — faqat CONFIRMED/PREPARING/READY da (`DELIVERY_LOCKED`). Haydovchiga push + `delivery.assigned` real-time |
| GET | `/admin/orders/:id/delivery/proof` | topshirish surati (xodimlar, o'sha haydovchi) |

## WebSocket (Socket.IO, namespace `/rt`)
Ulanish: `io(API + '/rt', { auth: { token: accessToken } })`. Token yaroqsiz — ulanish uziladi. Ulangach `ready` keladi.
Xonalar avtomatik: `user:{id}`; xodimlar — `staff`. Buyurtma sahifasida: `emit('order.subscribe', { orderId })` → `{ ok }` (faqat o'z buyurtmasi yoki menejer).
Ko'p server nusxasi uchun Redis adapter. Event nomlari: `@mebel/shared` → `RT`.

| Event | Kimga | Payload |
|---|---|---|
| `order.created` | staff | buyurtma kartochkasi (ovozli signal) |
| `order.status_changed` | staff, mijoz, order | `{ orderId, number, from, to, version }` |
| `order.quote_created` | mijoz, order | `{ orderId, quoteId }` |
| `payment.created` | staff | to'lov (chek tekshiruv navbati) |
| `payment.updated` | mijoz, staff, order | `{ id, status, amount, orderId, rejectReason }` |
| `chat.message` | order; mijoz xabari — staff, menejer xabari — mijoz | xabar + `orderNumber` |
| `chat.read` | order (+ staff) | `{ orderId, readerRole }` |
| `notification` | user | yangi bildirishnoma |

**Yetkazish kafolati:** hodisalar o'zgarish bilan bir tranzaksiyada `outbox_events` ga yoziladi, dispatcher (500 ms) tarqatadi. Xato bo'lsa — eksponensial qayta urinish (8 marta). Bildirishnoma `(event_id, user_id)` bo'yicha bir marta.

**Mijozga push** (Expo): taklif, tasdiq, tayyorlanmoqda, tayyor / olib ketishga tayyor, yo'lda, topshirildi, bekor qilindi, taklif muddati o'tdi, to'lov qabul qilindi/rad etildi, menejer xabari, nasiya eslatmasi (2 kun oldin, muddat kuni, keyin har 3 kunda). Matn foydalanuvchi tilida (uz/ru).

**Telegram (xodimlar guruhi):** yangi buyurtma, yangi chek, mijoz taklifni qabul/rad qildi, mijoz bekor qildi.

## Tashqi integratsiyalar
- SMS: Eskiz.uz (adapter interfeysi orqali, almashtirish oson)
- Push: Expo Push API
- Telegram Bot API: xodimlar guruhiga xabar
- 2-bosqich: Click / Payme webhook'lari `/integrations/click/*`, `/integrations/payme`
