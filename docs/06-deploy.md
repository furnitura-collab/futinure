# Deploy: Koyeb + Neon + Upstash (bepul)

| Qism | Servis | Bepul limit |
|---|---|---|
| Server (Dockerfile) | Koyeb | 1 web servis, 512 MB RAM, 1 soat so'rovsiz uxlaydi |
| Postgres | Neon | 0.5 GB, 100 CU-soat/oy, 5 daqiqa bo'sh tursa uxlaydi |
| Redis | Upstash | 256 MB, 500 ming buyruq/oy |

Server uxlaganda bazaga so'rov ketmaydi — Neon ham uxlaydi va limit tejaladi.

## 1. Neon (Postgres)
1. neon.tech → GitHub bilan kirish → **New project**, region: **Frankfurt (eu-central-1)**.
2. **Connect** → *Connection pooling* **o'chirilgan** holdagi manzilni nusxalang
   (`postgresql://...@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`).
   Pooler (`-pooler`) manzili migratsiyalar bilan ishlamaydi.

## 2. Upstash (Redis)
1. upstash.com → **Create database**, region: **eu-central-1 (Frankfurt)**.
2. **Connect → ioredis**dagi `rediss://default:...@...upstash.io:6379` manzilini nusxalang.

## 3. Koyeb (server)
1. koyeb.com → GitHub bilan kirish → **Create Web Service → GitHub** → `furniture` repo, branch `main`.
2. **Builder: Dockerfile** (repo ildizidagi `Dockerfile`).
3. **Instance: Free**, region: **Frankfurt**.
4. **Ports:** `3000`, HTTP, path `/`. **Health check:** HTTP `/api/v1/health`.
5. **Environment variables** (maxfiylarini *Secret* qilib qo'shing):

| Kalit | Qiymat |
|---|---|
| `PORT` | `3000` |
| `DATABASE_URL` | Neon manzili (Secret) |
| `REDIS_URL` | Upstash manzili (Secret) |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` (Secret) |
| `OTP_PEPPER` | `openssl rand -base64 48` (Secret) |
| `DEMO_MODE` | `true` |
| `OTP_TEST_PHONES` | `+998900000001,+998900000002,+998900000003,+998900000004,+998900000005` |

6. **Deploy**. Birinchi ishga tushishda migratsiyalar qo'llanadi va bo'sh bazaga demo ma'lumotlar yuklanadi.
   Manzil: `https://<nom>-<akkaunt>.koyeb.app` — `/` mobil web, `/admin/` admin panel.

`main`ga har push — avtomatik qayta deploy.
