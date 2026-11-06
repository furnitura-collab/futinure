#!/bin/sh
# Production start: migratsiya → demo ma'lumot (DEMO_MODE) yoki super admin (ADMIN_PHONE) → server
set -e
alembic upgrade head
if [ "$DEMO_MODE" = "true" ]; then
  if python -m app.scripts.db_empty; then
    echo "Baza bo'sh — demo ma'lumotlar yuklanmoqda"
    python -m app.scripts.seed
  fi
fi
if [ -n "${ADMIN_PHONE:-}" ]; then
  python -m app.scripts.create_admin
fi
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-3000}" --proxy-headers --forwarded-allow-ips '*'
