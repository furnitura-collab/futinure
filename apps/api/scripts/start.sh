#!/bin/sh
# Production start: migratsiya → demo ma'lumot (DEMO_MODE) yoki super admin (ADMIN_PHONE) → server
set -e
pnpm exec prisma migrate deploy
if [ "$DEMO_MODE" = "true" ]; then
  if node scripts/db-empty.mjs; then
    echo "Baza bo'sh — demo ma'lumotlar yuklanmoqda"
    pnpm exec prisma db seed
  fi
fi
if [ -n "${ADMIN_PHONE:-}" ]; then
  node --import @swc-node/register/esm-register prisma/create-admin.ts
fi
exec node dist/main.js
