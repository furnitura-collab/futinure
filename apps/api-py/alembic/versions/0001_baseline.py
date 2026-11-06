"""Baseline: NestJS davridagi Prisma migratsiyalari (alembic/baseline/*.sql).

Baza Prisma bilan allaqachon yaratilgan bo'lsa (users jadvali bor) — SQL qayta bajarilmaydi,
faqat versiya belgilanadi. Keyingi o'zgarishlar — yangi Alembic revision'lar.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-11-06
"""

import re
from collections.abc import Sequence
from pathlib import Path

from alembic import op
from sqlalchemy import text

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BASELINE = Path(__file__).resolve().parent.parent / "baseline"


def _statements(sql: str) -> list[str]:
    # Prisma SQL'ida funksiya/DO bloklari yo'q — har bir buyruq ";" bilan qator oxirida tugaydi
    sql = re.sub(r"^\s*--.*$", "", sql, flags=re.MULTILINE)
    return [s.strip() for s in re.split(r";\s*$", sql, flags=re.MULTILINE) if s.strip()]


def upgrade() -> None:
    bind = op.get_bind()
    if bind.execute(text("SELECT to_regclass('public.users') IS NOT NULL")).scalar():
        return
    for f in sorted(BASELINE.glob("*.sql")):
        for stmt in _statements(f.read_text()):
            op.execute(text(stmt))


def downgrade() -> None:
    raise RuntimeError("Baseline'ni orqaga qaytarib bo'lmaydi")
