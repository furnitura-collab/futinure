#!/bin/sh
# Kunlik zaxira: Postgres dump + yuklangan fayllar → deploy/backups/, 14 kundan eskilari o'chiriladi.
# BACKUP_REMOTE berilgan bo'lsa (rclone remote) — nusxa serverdan tashqariga ham yuboriladi.
# Cron: 0 3 * * * /opt/mebel-order/deploy/backup.sh >> /var/log/mebel-backup.log 2>&1
set -eu
cd "$(dirname "$0")"

BACKUP_REMOTE=$(grep -E '^BACKUP_REMOTE=' .env | cut -d= -f2- || true)
STAMP=$(date +%Y-%m-%d_%H%M)
mkdir -p backups

docker compose exec -T postgres pg_dump -U mebel --clean --if-exists mebel | gzip > "backups/db-$STAMP.sql.gz"
docker compose exec -T app tar czf - -C /data uploads > "backups/uploads-$STAMP.tar.gz"

find backups -type f -mtime +14 -delete

if [ -n "$BACKUP_REMOTE" ]; then
  rclone copy backups "$BACKUP_REMOTE" --max-age 25h
fi

echo "$(date '+%F %T') zaxira tayyor: $STAMP"
