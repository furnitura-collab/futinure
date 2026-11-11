# Mebel Order — loyiha hujjatlari

Mebel xomashyosi va furnitura buyurtma platformasi: mijoz ilovasi, admin panel, omborchi va haydovchi.

| Fayl | Mazmuni |
|---|---|
| [01-er-diagram.md](01-er-diagram.md) | Ma'lumotlar modeli, jadvallar, indekslar |
| [02-state-machine.md](02-state-machine.md) | Buyurtma va to'lov statuslari, o'tishlar, guard'lar |
| [03-api.md](03-api.md) | REST endpointlar, WebSocket eventlar |
| [04-screens.md](04-screens.md) | Ekranlar (mijoz, admin, omborchi, haydovchi) |
| [05-questions.md](05-questions.md) | Ochiq savollar va default qarorlar |

## Repo tuzilishi (reja)

```
mebel-order/
├─ apps/
│  ├─ api-py/       FastAPI backend (Python)
│  ├─ admin/        React + Vite admin panel (+ omborchi ko'rinishi)
│  └─ mobile/       Expo: mijoz + haydovchi
├─ packages/
│  ├─ shared/       zod sxemalar, tiplar, enumlar, narx/state machine qoidalari
│  └─ config/       eslint, tsconfig
├─ docker-compose.yml   postgres, redis, minio (S3)
└─ docs/
```

## Bosqichlar
- **MVP:** auth, katalog va admin CRUD (Excel import), ombor qoldig'i, savat, buyurtma, NEW → PREPARING oqimi (oldindan to'lovli shartlar), qo'lda to'lov tasdig'i, ledger/qarz, admin panel, push, chat
- **2-bosqich:** raspil, ~~haydovchi~~ (tayyor), slotlar va yetkazish narxi, Telegram bot, PDF hujjatlar, hisobotlar
- **3-bosqich:** Click/Payme, kesish optimizatsiyasi, promo-kodlar, bonus

MVP ichidagi tartib: shared + DB sxema → auth → katalog/admin → savat/buyurtma → state machine → to'lov/ledger → chat/push → mobil UI → admin UI.
