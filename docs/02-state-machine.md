# 02. Buyurtma state machine

## Diagramma

```mermaid
stateDiagram-v2
    [*] --> NEW : mijoz yubordi
    NEW --> CONFIRMED : menejer tasdiqladi (o'zgarishsiz)
    NEW --> QUOTED : menejer taklif yubordi
    QUOTED --> CONFIRMED : mijoz qabul qildi
    QUOTED --> NEW : mijoz rad etdi (izoh bilan) / taklif muddati o'tdi
    CONFIRMED --> PREPARING : yig'ish/kesish boshlandi
    PREPARING --> READY : tayyor
    READY --> OUT_FOR_DELIVERY : haydovchi oldi (DELIVERY)
    READY --> DELIVERED : mijoz olib ketdi (PICKUP)
    OUT_FOR_DELIVERY --> DELIVERED : topshirildi (foto)
    OUT_FOR_DELIVERY --> READY : yetkazib bo'lmadi
    DELIVERED --> COMPLETED : to'lov yopildi yoki nasiyaga yozildi

    NEW --> CANCELLED
    QUOTED --> CANCELLED
    CONFIRMED --> CANCELLED
    PREPARING --> CANCELLED
    READY --> CANCELLED
    COMPLETED --> [*]
    CANCELLED --> [*]
```

**Promptdan farq:** `READY_FOR_PICKUP` alohida status qilinmadi. `READY` + `delivery_type = PICKUP` UI'da "Olib ketishga tayyor" deb ko'rsatiladi. Statuslar soni kamroq, mantiq bir xil.

## O'tishlar jadvali

| # | Dan → Ga | Kim qila oladi | Shart (guard) | Yon ta'sirlar (bitta tranzaksiyada) |
|---|---|---|---|---|
| 1 | NEW → CONFIRMED | MANAGER, SUPER_ADMIN | Barcha qatorlar uchun mavjud qoldiq yetarli (yoki ON_ORDER). Raspil bo'lsa `price_final` belgilangan. To'lov shartlari belgilangan | Rezerv (`RESERVE` harakatlari), summalar muzlatiladi, push mijozga |
| 2 | NEW → QUOTED | MANAGER, SUPER_ADMIN | Kamida bitta o'zgarish yoki shart bor | `order_quotes` yangi versiya (oldingisi `SUPERSEDED`), push mijozga |
| 3 | QUOTED → CONFIRMED | CUSTOMER (o'z buyurtmasi) | Joriy taklif `PENDING` va muddati o'tmagan. Qoldiq hali ham yetarli | Taklif `ACCEPTED`, taklif o'zgarishlari `order_items`ga qo'llanadi, rezerv, menejerga xabar |
| 4 | QUOTED → NEW | CUSTOMER / tizim (cron) | Rad etishda izoh majburiy | Taklif `REJECTED`/`EXPIRED`, menejerga xabar |
| 5 | CONFIRMED → PREPARING | MANAGER, WAREHOUSE | `ADVANCE`/`PREPAID` bo'lsa `paid_total >= advance_amount` (yoki SUPER_ADMIN izoh bilan chetlab o'tadi). `CREDIT` bo'lsa yangi balans `<= credit_limit` yoki menejer ogohlantirishni tasdiqlagan | Omborchiga yig'ish vazifasi, raspil kartalari `IN_WORK` |
| 6 | PREPARING → READY | WAREHOUSE, MANAGER | Raspil kartalari `DONE` | Push mijozga ("tayyor" / "olib ketishga tayyor") |
| 7 | READY → OUT_FOR_DELIVERY | DRIVER, MANAGER | `delivery_type = DELIVERY`, haydovchi biriktirilgan | Qoldiqdan yechiladi (`OUT`, rezerv `RELEASE`), push mijozga |
| 8 | READY → DELIVERED | WAREHOUSE, MANAGER | `delivery_type = PICKUP`, qabul qiluvchi ismi | Qoldiqdan yechiladi, ledger `DEBIT grand_total` |
| 9 | OUT_FOR_DELIVERY → DELIVERED | DRIVER | Foto va qabul qiluvchi ismi | Ledger `DEBIT grand_total`, push |
| 10 | OUT_FOR_DELIVERY → READY | DRIVER, MANAGER | Sabab majburiy | Qoldiq qaytariladi (`IN` + `RESERVE`), menejerga xabar |
| 11 | DELIVERED → COMPLETED | tizim (avtomatik) | `paid_total >= grand_total` YOKI `payment_terms = CREDIT` | — |
| 12 | * → CANCELLED | CUSTOMER: faqat NEW, QUOTED. MANAGER: CONFIRMED gacha, PREPARING (raspilsiz). SUPER_ADMIN: READY gacha hammasi | Sabab majburiy | Rezerv `RELEASE`. To'langan bo'lsa: ledger'da mijoz balansiga qaytariladi (haqdor) yoki `REFUND` yoziladi — tanlov menejerda |

## Amalga oshirishdagi aniqliklar

- **Rezerv:** "buyurtma asosida" (ON_ORDER) tovar qoldiq yetmasa band qilinmaydi; jo'natishda qoldiq bo'lmasa 409 `STOCK_NOT_RECEIVED` — avval kirim qilinadi.
- **Qancha band qilingani** alohida saqlanmaydi, `stock_movements` dan hisoblanadi (RESERVE − RELEASE) — bo'shatish doim aniq.
- **Avansni chetlab o'tish** (`overrideAdvance`) — faqat super admin, izoh bilan. **Kredit limitidan oshish** (`overrideCreditLimit`) — menejer, izoh bilan.
- **Olib ketishda** `receiverName` majburiy, tarixga "Qabul qildi: …" bo'lib yoziladi.
- **Nasiyada** topshirilganda `due_date = bugun + payment_term_days`, buyurtma darhol COMPLETED (qarz ledger'da qoladi).
- **Taklif muddati** har daqiqada tekshiriladi (`QuoteExpiryScheduler`).
- **Menejer biriktirish** — buyurtmaga birinchi tekkan menejer avtomatik biriktiriladi; qo'lda almashtirish versiyani oshirmaydi.

## Muhim qoidalar

- **Bitta joyda:** barcha o'tishlar `OrderStateMachine.transition(orderId, to, actor, payload)` orqali. To'g'ridan-to'g'ri `UPDATE orders SET status` taqiqlanadi.
- **Optimistic lock:** `orders.version` ustuni. Ikki menejer bir vaqtda bossa, ikkinchisi `409 Conflict` oladi.
- **Rezerv atomik:** `UPDATE product_variants SET reserved_qty = reserved_qty + $q WHERE id = $id AND stock_qty - reserved_qty >= $q` — 0 qator yangilansa, o'tish rad etiladi va qaysi mahsulot yetmagani qaytariladi.
- **Ledger qachon yoziladi:** qarz (DEBIT) tovar topshirilganda paydo bo'ladi. Oldindan to'langan avans darhol `CREDIT` bo'lib tushadi, ya'ni topshirishgacha mijoz "haqdor" bo'lib turadi. Shunda akt-sverka buxgalteriya mantiqiga mos keladi.
- **Taklif muddati:** `expires_at` (default 24 soat, settings'da). Cron muddati o'tganlarni `QUOTED → NEW` qiladi.
- **Har o'tish:** `order_status_history` + `audit_logs` + WebSocket event + push.

## To'lov oqimi (statusdan mustaqil)

```mermaid
stateDiagram-v2
    [*] --> PENDING : mijoz chek yukladi / menejer naqd kiritdi
    PENDING --> CONFIRMED : menejer tasdiqladi
    PENDING --> REJECTED : menejer rad etdi (sabab)
    CONFIRMED --> [*]
    REJECTED --> [*]
```

Tasdiqlanganda (bitta tranzaksiyada): `orders.paid_total += amount`, ledger `CREDIT`, `customer_profiles.balance_cached` yangilanadi, buyurtma DELIVERED bo'lsa 11-o'tish tekshiriladi.
