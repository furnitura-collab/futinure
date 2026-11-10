# Backend: NestJS → Python (FastAPI) migratsiyasi

## Prompt (senior Python dev uchun brif)

> Sen senior Python backend dasturchisan. `apps/api` (NestJS 12 + Prisma 7 + PostgreSQL 17 + Redis + Socket.IO)
> backend'ini **xatti-harakati aynan bir xil** bo'lgan Python backend'ga ko'chir: `apps/api-py`.
>
> **Shartlar:**
> 1. **HTTP shartnoma o'zgarmaydi.** Yo'llar, status kodlar, JSON shakli (camelCase kalitlar), xato formati
>    `{ "error": { "code", "message", "details"? } }` — admin panel va mobil ilova hech narsa sezmasligi kerak.
> 2. **Baza o'zgarmaydi.** O'sha PostgreSQL sxemasi (`apps/api/prisma/schema.prisma`, migratsiyalar
>    `apps/api/prisma/migrations`). Ma'lumot ko'chirish yo'q.
> 3. **Isbot — mavjud 250 ta e2e test.** `apps/api/test/*.e2e.test.ts` (o'sha paytda) Python serverga qarshi ishga tushiriladi
>    (`API_IMPL=py`). Hammasi o'tmaguncha migratsiya tugamagan.
> 4. Biznes qoidalari (narx, qoldiq, status o'tishlari) `packages/shared` dagi TS kod bilan bir xil natija beradi.
> 5. Idiomatik, tiplangan Python: FastAPI dependency'lar, Pydantic v2, SQLAlchemy 2.0 async, `ruff` toza.

## Stack

| NestJS | Python |
|---|---|
| NestJS 12 | **FastAPI** + Uvicorn |
| Prisma 7 | **SQLAlchemy 2.0 async** + asyncpg |
| prisma migrate | **Alembic** (baseline — Prisma SQL migratsiyalari) |
| Zod (`@mebel/shared`) | **Pydantic v2** |
| ioredis | **redis-py** (asyncio) |
| Socket.IO + redis-adapter | **python-socketio** (ASGI) + `AsyncRedisManager` |
| @nestjs/jwt | **PyJWT** (HS256) |
| node:crypto scrypt | `hashlib.scrypt` (N=16384, r=8, p=1, 64 bayt) — eski parollar ishlaydi |
| ExcelJS | **openpyxl** |
| fetch | **httpx** |
| Vitest | Vitest e2e (shartnoma testlari, Python serverga qarshi) |

Python 3.14 (`uuid.uuid7()` — Prisma `uuid(7)` bilan bir xil), paketlar `uv` bilan.

## Tuzilish

```
apps/api-py/
├─ pyproject.toml
├─ alembic/                 baseline: Prisma migratsiyalari SQL'i
├─ app/
│  ├─ main.py               create_app(): FastAPI + Socket.IO ASGI, routerlarni avtomatik ulaydi
│  ├─ config.py             env (NestJS env.ts bilan bir xil nomlar va tekshiruvlar)
│  ├─ db.py                 engine, sessiya, transaction()
│  ├─ models.py             SQLAlchemy modellari (schema.prisma'ning aynan nusxasi)
│  ├─ core/                 errors, serialize, schemas (qty/phone/money/pagination), redis, dates
│  ├─ domain/               packages/shared porti: quantity, pricing, availability, state_machine
│  ├─ services/             audit, ledger, outbox, realtime, storage, senders (umumiy servislar)
│  ├─ auth/                 tokenlar, OTP, parol, dependency'lar (current_user, require_roles)
│  ├─ modules/<nom>/        har bir NestJS moduli: router.py (+ service.py, schemas.py)
│  └─ testing.py            /__test__ yo'llari (faqat NODE_ENV=test)
└─ scripts/start.sh         migratsiya → demo seed / super admin → uvicorn
```

`app/modules/*/router.py` dagi `router` avtomatik ulanadi — yangi modul uchun umumiy faylni tahrirlash shart emas.

## Qoidalar (port qilayotganda)

- **JSON:** pul (BigInt) → `int`; miqdor (Decimal) → normallashgan satr (`"12.5"`, `"120"` — oxirgi nollarsiz);
  vaqt → `"2026-11-06T10:00:00.000Z"` (ms, Z); `@db.Date` → `"2026-11-10T00:00:00.000Z"`.
  Hammasi `app.core.serialize.dump()` orqali. Prisma `select`/`include` qaytargan shaklni aynan takrorlang
  (skalyar maydonlar sxema tartibida, `passwordHash` hech qachon).
- **Xatolar:** `AppError(code, message, status=400, details=None)`. Validatsiya xatosi →
  422 `VALIDATION_ERROR`, `details: [{ path: "a.b", message }]`. Prisma P2002 → 409 `CONFLICT`, P2025 → 404 `NOT_FOUND`
  (`IntegrityError` unique buzilishi → 409).
- **Tranzaksiya:** Prisma `$transaction` → `async with transaction(db):`. `FOR UPDATE` joylari aynan saqlanadi.
- **Auth:** `Public` yo'l — `Depends(optional_user)`; himoyalangan — `Depends(current_user)`;
  `@Roles(...)` — `Depends(require_roles(...))`.
- **Yon ta'sirlar** (SMS, push, Telegram) faqat `app.services.senders` orqali — testda ular `TEST_SINK_URL` ga yuboriladi.
- Kod izohlari o'zbekcha, mavjud uslubda.

## Testlar

```bash
docker compose up -d                       # postgres + redis
pnpm test:api                              # yoki: cd apps/api-py && uv run pytest
cd apps/api-py && uv run pytest tests/test_orders.py -k cancel   # bitta fayl / test
```

Ilova jarayon ichida (httpx + ASGI), haqiqiy Postgres va Redis bilan; Socket.IO testlari haqiqiy uvicorn serverga ulanadi.
Har testdan oldin jadvallar tozalanadi. Yordamchilar: `tests/support.py` (`Ctx`, `user_with_token`, `seed_catalog`,
`assert_matches`, fake SMS/push/Telegram). Parallel ishlatish uchun: `TEST_DATABASE_URL`, `TEST_REDIS_DB`.

## Holat (2026-11-06)

Migratsiya tugadi, NestJS (`apps/api`) olib tashlandi — backend faqat Python.
Ko'chirish paytida eski 250 ta Vitest e2e testi Python serverga qarshi ishga tushirilib, 250/250 o'tdi; keyin ular
pytest'ga ko'chirildi (`apps/api-py/tests`, 252 ta test, shu jumladan `@mebel/shared` enumlari bilan sinxronlik).
Docker image Python backend bilan yig'iladi (`Dockerfile`), `deploy/` va `docs/10-free-deploy.md` o'zgarishsiz ishlaydi.

Qo'shimcha tekshiruvlar:
- Alembic baseline (`alembic/baseline/*.sql` — Prisma migratsiyalari) yaratgan sxema Prisma'nikidan farq qilmaydi;
  Prisma bilan yaratilgan mavjud bazada faqat versiya belgilanadi (ma'lumot ko'chirish shart emas).
- SQLAlchemy modellari bazadagi ustun va turlar bilan to'liq mos.
- Parol xeshlari (scrypt) Node ↔ Python ikki tomonga mos — mavjud foydalanuvchilar kira oladi. JWT ham mos.
- Ko'chirishda har modul bo'yicha NestJS va Python javoblari, audit/outbox/ledger yozuvlari solishtirilgan — bir xil.

Ma'lum farqlar:
- Validatsiya xabarlari (`details[].message`) asosan Zod matniga keltirilgan, ba'zilari farq qilishi mumkin;
  `code`, status va `path` bir xil (mijozlar `code` bo'yicha ishlaydi).
- Juda kam holat: so'rovda ham noto'g'ri UUID, ham noto'g'ri body bo'lsa — Nest 400, Python 422.
- Alembic `--autogenerate` hozircha indeks/FK nomlari bo'yicha "shovqin" beradi — yangi migratsiyalarni qo'lda yozing.

**NestJS'dan o'tgan xato (tuzatilgan):** Zod 4'da `.partial()` `.default()` qiymatlarini qo'llardi — PATCH
yuborilmagan maydonlarni standart qiymatga qaytarardi. Endi `PATCH /admin/products|variants|categories|brands|price-groups/:id`
va `PATCH /addresses/:id` faqat yuborilgan maydonlarni o'zgartiradi (`PartialSchema.PATCH`, `AddressUpdate.values()`).

## Bosqichlar

1. Poydevor: config, db, modellar, xatolar, serializatsiya, auth, audit/ledger/outbox, realtime, storage,
   health, web, test harness → `auth.e2e` o'tadi.
2. Katalog + savat → `catalog`, `admin-catalog`, `catalog-excel`, `cart`.
   Parallel: staff, me, manzillar, mijozlar, bildirishnomalar infratuzilmasi → `staff`.
3. Buyurtmalar → `orders`, `admin-orders`.
4. To'lovlar, yetkazish, chat → `payments`, `deliveries`; keyin `notifications`.
5. Deploy: Dockerfile, `deploy/`, hujjatlar.
6. Testlar pytest'ga ko'chirildi, NestJS olib tashlandi.
