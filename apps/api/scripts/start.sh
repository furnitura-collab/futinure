#!/bin/sh
# Production start: migratsiya → bo'sh bazaga demo ma'lumot → server
set -e
pnpm exec prisma migrate deploy
if node scripts/db-empty.mjs; then
  echo "Baza bo'sh — demo ma'lumotlar yuklanmoqda"
  pnpm exec prisma db seed
fi
exec node dist/main.js
