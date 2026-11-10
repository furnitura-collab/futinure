# Bepul deploy (sinov bosqichi): Render + Supabase + Upstash (+ Vercel), APK — Telegram orqali

Bozorda sinab ko'rish uchun. Hammasi bepul tariflarda; mijozlar ko'paygach `06-deploy.md` (VPS) ga o'tiladi.

| Qism | Xizmat | Izoh |
|---|---|---|
| API + admin + mobil web | Render (Free Web Service, repo `Dockerfile`) | 512 MB RAM; 15 daqiqa so'rov bo'lmasa uxlaydi — 5-bo'lim |
| PostgreSQL | Supabase | 500 MB |
| Fayllar (rasmlar, cheklar) | Supabase Storage | 1 GB; Render diski vaqtinchalik, shuning uchun shart |
| Redis | Upstash | bepul tarif |
| Android ilova | EAS Build → APK | oyiga bir necha bepul build |
| Admin va mobil web (ixtiyoriy) | Vercel — 7-bo'lim | tez ochiladi; API baribir Render'da |

Manzillar: `https://<nom>.onrender.com/` — mobil web, `/admin/` — admin panel, `/api/v1` — API.

## 1. Supabase
1. supabase.com → **New project**, region **Frankfurt (eu-central-1)**. Database parolini saqlab qo'ying.
2. **Connect → Session pooler** satridagi URL — bu `DATABASE_URL` (`[YOUR-PASSWORD]` o'rniga parol).
   Direct connection emas: u IPv6, Render esa IPv4.
3. **Storage → New bucket**: ikkita bucket yarating:
   - `catalog` — **Public bucket** yoqilgan (katalog rasmlari);
   - `private` — Public **o'chiq** (to'lov cheklari, chat fayllari).
4. **Project Settings → API**: `Project URL` → `SUPABASE_URL`, `service_role` kalit → `SUPABASE_SERVICE_KEY`.
   `service_role` maxfiy — faqat Render env'ga yoziladi, hech qayerda ko'rsatilmaydi.

## 2. Upstash
upstash.com → **Create Database** (Redis), region **eu-central-1**. `rediss://default:...@...upstash.io:6379`
ko'rinishidagi URL — bu `REDIS_URL`.

## 3. Render
1. render.com → GitHub bilan kiring → **New → Web Service** → repo'ni tanlang.
2. Name: **`mebel-order`** (manzil `https://mebel-order.onrender.com` bo'ladi; band bo'lsa boshqa nom bering
   va 6-bo'limdagi `eas.json` dagi manzilni ham o'zgartiring). Region **Frankfurt**, Language **Docker**,
   Instance type **Free**.
3. **Environment Variables**:
   ```
   NODE_ENV=production
   DATABASE_URL=<Supabase session pooler>
   REDIS_URL=<Upstash rediss://...>
   SUPABASE_URL=<https://xxxx.supabase.co>
   SUPABASE_SERVICE_KEY=<service_role>
   JWT_ACCESS_SECRET=<openssl rand -hex 32>
   OTP_PEPPER=<openssl rand -hex 32>
   DEMO_MODE=true
   OTP_TEST_PHONES=+998900000001,+998900000002,+998900000003
   ADMIN_URL=https://mebel-order.onrender.com/admin/
   ```
   Kerak bo'lsa: `ADMIN_PHONE`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   (ma'nosi — `deploy/.env.example` da).
4. **Health Check Path**: `/api/v1/health`. **Create Web Service** — birinchi build 10–15 daqiqa.
   Logda `Baza bo'sh — demo ma'lumotlar yuklanmoqda` chiqsa, server ishlayapti.

## 4. Tekshirish
- `https://mebel-order.onrender.com/api/v1/health` — `ok`.
- `/admin/` ga kiring, mahsulotga rasm yuklang, sahifani yangilang — rasm ko'rinsa, Supabase Storage ishlayapti
  (Supabase → Storage → `catalog` da fayl paydo bo'ladi).

## 5. Uxlab qolmasligi uchun
Render bepul server 15 daqiqa so'rov kelmasa to'xtaydi — fon vazifalari (taklif muddati, qarz eslatmasi,
Telegram xabarlari) ham to'xtaydi, birinchi kirish ~1 daqiqa kutadi.
cron-job.org → bepul ro'yxatdan o'ting → **Create cronjob**: URL `https://mebel-order.onrender.com/api/v1/health`,
har **10 daqiqada**.

Supabase bepul loyiha 1 hafta faolsiz bo'lsa to'xtaydi — API fon vazifalari bazaga doim murojaat qilgani uchun
server uyg'oq tursa bunday bo'lmaydi.

## 6. APK — Telegram orqali tarqatish
API manzili `apps/mobile/eas.json` da (`preview` profili, `EXPO_PUBLIC_API_URL`). Render nomi boshqa bo'lsa — o'zgartiring.

Bir marta:
```bash
npm i -g eas-cli
eas login                 # expo.dev akkaunti (bepul)
cd apps/mobile
eas init                  # app.json ga projectId yoziladi — commit qiling
```

Har safar yangi versiya kerak bo'lsa:
```bash
cd apps/mobile
eas build -p android --profile preview
```
Build Expo serverlarida ~10–20 daqiqa (bepul navbatda ko'proq). Oxirida `.apk` havolasi chiqadi — yuklab olib,
Telegram'ga **fayl** sifatida yuboring. Telefonda: faylni ochish → "Noma'lum manbalardan o'rnatish"ga ruxsat → O'rnatish.

Yangi versiyada `app.json` → `expo.version` ni oshiring (masalan `1.0.1`) va `android.versionCode` qo'shing/oshiring —
aks holda telefon eski ilova ustiga o'rnatmaydi.

Eslatmalar:
- Push bildirishnomalar APK'da hozircha ishlamaydi (Firebase/FCM sozlanmagan) — ilova buni jimgina o'tkazib yuboradi.
- APK API'ga ulanishi uchun Render uyg'oq bo'lishi kerak (5-bo'lim).

## 7. Frontend — Vercel (ixtiyoriy)
API Vercel'da ishlamaydi (Socket.IO, fon vazifalari doim ishlab turishi kerak) — u Render'da qoladi.
Vercel'ga faqat statik admin panel va mobil web qo'yiladi; ular API'ga `VITE_API_URL` / `EXPO_PUBLIC_API_URL`
orqali to'g'ridan-to'g'ri ulanadi (API'da CORS ochiq). Build sozlamalari `apps/admin/vercel.json` va `apps/mobile/vercel.json` da.

Ikkita loyiha: vercel.com → **Add New → Project** → repo → **Root Directory**:

| Loyiha | Root Directory | Environment Variables |
|---|---|---|
| `mebel-admin` | `apps/admin` | `VITE_API_URL=https://mebel-order.onrender.com`, `ENABLE_EXPERIMENTAL_COREPACK=1` |
| `mebel-app` | `apps/mobile` | `EXPO_PUBLIC_API_URL=https://mebel-order.onrender.com`, `ENABLE_EXPERIMENTAL_COREPACK=1` |

Framework Preset — **Other**, qolgan maydonlar bo'sh (vercel.json'dan olinadi). Deploy'dan keyin Render'da
`ADMIN_URL=https://mebel-admin.vercel.app/` qiling (Telegram xabaridagi havola). Env o'zgarsa — **Redeploy**
(qiymatlar build paytida kodga yoziladi).

## VPS'ga ko'chish
Supabase'dan baza: `pg_dump "<DATABASE_URL>" > dump.sql`, VPS'da tiklanadi. Fayllar Supabase Storage'da qoladi —
VPS'da ham `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` berilsa, o'sha yerdan o'qiladi; berilmasa lokal diskka yoziladi.
