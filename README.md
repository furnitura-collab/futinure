# Mebel Order

Mebel xomashyosi va furnitura buyurtma platformasi. Dizayn hujjatlari: [docs/](docs/README.md).

## Talablar
- Python 3.14 + [uv](https://docs.astral.sh/uv/) (backend)
- Node.js 22+ (24 LTS tavsiya), pnpm 10+ (admin panel, mobil ilova, testlar)
- Docker (Postgres va Redis uchun)

## Ishga tushirish

```bash
pnpm install
pnpm db:up                                   # Postgres :5433, Redis :6380
pnpm --filter @mebel/shared build
cd apps/api-py && cp .env.example .env && uv sync
uv run alembic upgrade head                  # migratsiyalar
uv run python -m app.scripts.seed            # demo ma'lumotlar
cd ../.. && pnpm dev:api                     # http://localhost:3000/api/v1 (FastAPI, docs: /api/v1/docs)
pnpm dev:admin                               # http://localhost:3001 (admin panel)
pnpm dev:mobile                              # Expo: i — iOS simulator, a — Android, w — web
```

Mobil ilova telefonda (Expo Go yoki dev build) ishlashi uchun `apps/mobile/.env` da
`EXPO_PUBLIC_API_URL` kompyuterning lokal IP manzili bo'lsin (masalan `http://192.168.1.10:3000`).
Push bildirishnomalar faqat haqiqiy qurilmada va EAS `projectId` bilan ishlaydi.

### Demo foydalanuvchilar
Kirish — telefon + parol (`POST /auth/login`). Paroli yo'q hisobga birinchi kirishda kiritilgan parol o'rnatiladi,
yangi raqam esa shu parol bilan mijoz sifatida ro'yxatdan o'tadi. SMS (OTP) endpointlari ham ishlaydi, ilovalar hozircha ularni ishlatmaydi.

| Telefon | Rol |
|---|---|
| +998900000001 | Super admin |
| +998900000002 | Menejer |
| +998900000003 | Omborchi |
| +998900000004 | Haydovchi (mobil ilovada — yetkazishlar) |
| +998900000005 | Mijoz (Usta guruhi, nasiya limiti 10 mln) |

Admin panelga menejer, super admin va omborchi kiradi. Haydovchi mobil ilovaga kiradi; unga yetkazishni menejer buyurtma sahifasidagi "Haydovchi" kartasidan biriktiradi.

## Testlar

```bash
pnpm test:api    # backend: pytest (252 ta test; mebel_test bazasi avtomatik yaratiladi)
pnpm test        # shared va admin unit testlari
pnpm typecheck
cd apps/api-py && uv run ruff check app tests
```

## Tuzilma

```
apps/api-py       Backend: FastAPI + SQLAlchemy 2 (async) + Alembic + python-socketio + pytest — docs/11-python-backend.md
apps/admin        React 19 + Vite + TanStack Query + Tailwind (xodimlar paneli)
apps/mobile       Expo SDK 58 + expo-router (mijoz ilovasi, uz/ru)
packages/shared   enumlar, zod sxemalar, state machine, narx/miqdor hisobi
docs/             ER, state machine, API, ekranlar
```

## Deploy

Bitta Docker servis hammasini beradi: `/api/v1` — API, `/admin/` — admin panel, `/` — mobil ilovaning web versiyasi.

**Lokal production:**
```bash
docker build -t mebel-order .
docker run -p 8080:3000 -e DATABASE_URL=... -e REDIS_URL=... \
  -e JWT_ACCESS_SECRET=$(openssl rand -base64 48) -e OTP_PEPPER=$(openssl rand -base64 48) \
  -e DEMO_MODE=true -e OTP_TEST_PHONES=+998900000001,... mebel-order
```
Start'da migratsiyalar qo'llanadi, baza bo'sh bo'lsa demo ma'lumotlar yuklanadi.

**VPS (Contabo) — asosiy:** `deploy/` papkasi (Caddy HTTPS + app + Postgres + Redis, kunlik backup),
batafsil — [docs/06-deploy.md](docs/06-deploy.md).

**Bepul (sinov):** Render + Supabase (baza va fayllar) + Upstash, Android APK — EAS Build,
batafsil — [docs/10-free-deploy.md](docs/10-free-deploy.md).

`DEMO_MODE=true` — SMS yuborilmaydi, test raqamlar uchun kod `000000`. Haqiqiy foydalanuvchilar uchun o'chirib, Eskiz sozlang.
