# Deploy: VPS (Contabo Cloud VPS 4)

Bitta server, hammasi Docker'da: Caddy (HTTPS) → app (API + admin + mobil web), Postgres, Redis.
Fayllar `deploy/` papkasida.

| Qism | Qayerda | Ma'lumot saqlanadi |
|---|---|---|
| Caddy | `caddy` konteyner, 80/443 portlar | sertifikatlar — `caddy_data` volume |
| API + web | `app` konteyner (repo `Dockerfile`) | yuklangan fayllar — `uploads` volume |
| Postgres 17 | `postgres` konteyner, tashqariga ochiq emas | `pgdata` volume |
| Redis 7 | `redis` konteyner, tashqariga ochiq emas | `redisdata` volume |

Manzillar: `/` — mobil web, `/admin/` — admin panel, `/api/v1` — API.

## 1. Server buyurtma qilish
Contabo → **Cloud VPS 4** (4 vCPU, 8 GB RAM, 100 GB SSD), region **European Union**,
OS **Ubuntu 24.04**, kirish uchun **SSH kalit** qo'shing (yo'q bo'lsa: `ssh-keygen -t ed25519`,
`~/.ssh/id_ed25519.pub` mazmunini kiriting). Auto Backup shart emas — o'z zaxiramiz bor (5-bo'lim).

## 2. Serverni tayyorlash (bir marta)
```bash
ssh root@<IP>
curl -fsSL https://raw.githubusercontent.com/soliha10/furniture/main/deploy/setup-server.sh | sh
```
Skript: tizimni yangilaydi, Docker, firewall (faqat 22/80/443), fail2ban, avtomatik xavfsizlik
yangilanishlarini o'rnatadi; SSH kalit bo'lsa parol bilan kirishni o'chiradi.

Repo private bo'lsa, `curl` ishlamaydi — avval 3-bo'limdagidek klonlab, `sh deploy/setup-server.sh`.

## 3. Ilovani ishga tushirish
```bash
git clone https://github.com/soliha10/furniture.git /opt/mebel-order
cd /opt/mebel-order/deploy
cp .env.example .env
nano .env
```
Private repo uchun: GitHub → *Settings → Developer settings → Fine-grained token* (faqat shu repo, *Contents: read*),
klonlashda parol o'rniga token kiriting.

`.env` da to'ldiring:
- `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET`, `OTP_PEPPER` — har biri uchun `openssl rand -hex 32`.
- `DOMAIN` — domen bo'lsa (masalan `mebel.uz`), bo'lmasa bo'sh qoldiring (sayt `http://<IP>` da ochiladi).
- `ADMIN_URL` — `https://<domen>/admin/` yoki `http://<IP>/admin/` (Telegram xabarlaridagi havolalar uchun).

```bash
docker compose up -d --build     # birinchi build ~5–10 daqiqa
docker compose logs -f app       # "Baza bo'sh — demo ma'lumotlar yuklanmoqda" → server ishga tushdi
```
Start'da migratsiyalar qo'llanadi, baza bo'sh bo'lsa demo ma'lumotlar yuklanadi.
Tekshirish: `curl http://localhost/api/v1/health`.

## 4. Domen va HTTPS
1. Domen DNS'ida **A yozuv**: `@` (yoki `app`) → server IP.
2. `.env` da `DOMAIN=mebel.uz`, `ADMIN_URL=https://mebel.uz/admin/`.
3. `docker compose up -d` — Caddy Let's Encrypt sertifikatini o'zi oladi va yangilab turadi.

Mobil ilovaning native build'ida `EXPO_PUBLIC_API_URL=https://<domen>` bo'lsin (push va kamera HTTPS talab qiladi).

## 5. Zaxira nusxa (backup)
`deploy/backup.sh` — Postgres dump + yuklangan fayllar `deploy/backups/` ga, 14 kundan eskilari o'chadi.
```bash
crontab -e
# qo'shing:
0 3 * * * /opt/mebel-order/deploy/backup.sh >> /var/log/mebel-backup.log 2>&1
```
Server buzilsa, zaxira u bilan birga yo'qoladi — shuning uchun nusxani tashqariga ham yuboring:
`rclone config` bilan remote qo'shing (Cloudflare R2 — 10 GB bepul, yoki Contabo Object Storage),
keyin `.env` da `BACKUP_REMOTE=r2:mebel-backups`.

**Tiklash:**
```bash
cd /opt/mebel-order/deploy
gunzip -c backups/db-<sana>.sql.gz | docker compose exec -T postgres psql -U mebel mebel
docker compose exec -T app tar xzf - -C /data < backups/uploads-<sana>.tar.gz
```

## 6. Yangilash
```bash
cd /opt/mebel-order && git pull && cd deploy && docker compose up -d --build
```
Yangi migratsiyalar start'da avtomatik qo'llanadi.

## Foydali buyruqlar
```bash
docker compose ps                          # holat
docker compose logs -f --tail 100 app      # loglar
docker compose restart app
docker compose exec postgres psql -U mebel mebel
docker system prune -f                     # eski image'larni tozalash (disk to'lsa)
```

## Haqiqiy foydalanuvchilar uchun (production)
1. Domen + HTTPS (4-bo'lim) — majburiy.
2. Eskiz.uz da akkaunt, SMS shabloni tasdiqlangan bo'lsin.
3. `.env`:
   ```
   DEMO_MODE=false
   OTP_TEST_PHONES=
   SMS_PROVIDER=eskiz
   ESKIZ_EMAIL=...
   ESKIZ_PASSWORD=...
   ADMIN_PHONE=+998XXXXXXXXX
   ADMIN_NAME=Ism Familiya
   ADMIN_PASSWORD=kamida-6-belgi
   ```
   `ADMIN_PASSWORD` faqat super adminning paroli hali yo'q bo'lsa o'rnatiladi (har restartda qayta yozilmaydi).
   Keyin parolni admin panelda Profil → «Parolni o'zgartirish» orqali almashtiring va `.env` dan olib tashlang.
4. Demo ma'lumotlar bilan ishlagan bo'lsa — toza bazadan boshlash (**hamma ma'lumot o'chadi**):
   ```bash
   docker compose down
   docker volume rm deploy_pgdata deploy_uploads deploy_redisdata
   docker compose up -d --build
   ```
   `DEMO_MODE=false` da demo yuklanmaydi, faqat `ADMIN_PHONE` super admini yaratiladi.
5. Admin panelga `ADMIN_PHONE` + `ADMIN_PASSWORD` bilan kiring → kategoriya va mahsulotlarni qo'shing.
   Xodimlar (`MANAGER`, `WAREHOUSE`, `DRIVER`, `SUPER_ADMIN`) — admin panelda **Xodimlar** sahifasida
   (faqat super admin; API: `POST /api/v1/admin/staff`). Xodim parolini super admin beradi —
   paroli yo'q xodim parol bilan kira olmaydi (`PASSWORD_NOT_SET`). Parolni tiklash va bloklash ham shu sahifada
   (barcha sessiyalari yopiladi).
6. Zaxira cron'i ishlayotganini va tashqi nusxa borligini tekshiring.
