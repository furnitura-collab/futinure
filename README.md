# Mebel Order

Mebel xomashyosi va furnitura buyurtma platformasi. Dizayn hujjatlari: [docs/](docs/README.md).

## Talablar
- Node.js 22+ (24 LTS tavsiya), pnpm 10+
- Docker (Postgres va Redis uchun)

## Ishga tushirish

```bash
pnpm install
pnpm db:up                                   # Postgres :5433, Redis :6380
cp apps/api/.env.example apps/api/.env
pnpm --filter @mebel/shared build
pnpm --filter @mebel/api db:migrate          # migratsiyalar + Prisma client
pnpm --filter @mebel/api db:seed             # demo ma'lumotlar
pnpm dev:api                                 # http://localhost:3000/api/v1
pnpm dev:admin                               # http://localhost:3001 (admin panel)
pnpm dev:mobile                              # Expo: i — iOS simulator, a — Android, w — web
```

Mobil ilova telefonda (Expo Go yoki dev build) ishlashi uchun `apps/mobile/.env` da
`EXPO_PUBLIC_API_URL` kompyuterning lokal IP manzili bo'lsin (masalan `http://192.168.1.10:3000`).
Push bildirishnomalar faqat haqiqiy qurilmada va EAS `projectId` bilan ishlaydi.

### Demo foydalanuvchilar
SMS yuborilmaydi, kod har doim `000000`:

| Telefon | Rol |
|---|---|
| +998900000001 | Super admin |
| +998900000002 | Menejer |
| +998900000003 | Omborchi |
| +998900000004 | Haydovchi (mobil ilovada — yetkazishlar) |
| +998900000005 | Mijoz (Usta guruhi, nasiya limiti 10 mln) |

Boshqa raqamlar bilan kirilganda kod API logiga chiqadi (`SMS_PROVIDER=console`).
Admin panelga menejer, super admin va omborchi kiradi. Haydovchi mobil ilovaga kiradi; unga yetkazishni menejer buyurtma sahifasidagi "Haydovchi" kartasidan biriktiradi.

## Testlar

```bash
pnpm test        # shared unit + API unit/e2e (mebel_test bazasi avtomatik yaratiladi)
pnpm typecheck
```

## Tuzilma

```
apps/api          NestJS 12 + Prisma 7 (ESM)
apps/admin        React 19 + Vite + TanStack Query + Tailwind (xodimlar paneli)
apps/mobile       Expo SDK 58 + expo-router (mijoz ilovasi, uz/ru)
packages/shared   enumlar, zod sxemalar, state machine, narx/miqdor hisobi
docs/             ER, state machine, API, ekranlar
```
