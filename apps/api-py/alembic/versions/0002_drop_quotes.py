"""Takliflar va QUOTED/CONFIRMED statuslari olib tashlandi: buyurtma NEW → PREPARING (menejer qabul qiladi).

Mavjud ma'lumot: QUOTED → NEW (taklif bekor), CONFIRMED → PREPARING (qabul qilingan, tovar allaqachon rezervda).
Tarix ham shunga moslanadi: "qabul qilindi" qadami NEW → PREPARING bo'lib qoladi.
Qaytarib bo'lmaydi — takliflar jadvali o'chiriladi.

Revision ID: 0002_drop_quotes
Revises: 0001_baseline
Create Date: 2026-11-11
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_drop_quotes"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DATA = (
    """UPDATE orders SET status = 'NEW' WHERE status = 'QUOTED'""",
    """UPDATE orders SET status = 'PREPARING' WHERE status = 'CONFIRMED'""",
    # Tarix: taklif qadamlari va keraksiz bo'lib qolgan "CONFIRMED → PREPARING" o'chadi
    """DELETE FROM order_status_history
       WHERE to_status = 'QUOTED' OR (from_status = 'QUOTED' AND to_status = 'NEW')
          OR (from_status = 'CONFIRMED' AND to_status = 'PREPARING')""",
    """UPDATE order_status_history SET to_status = 'PREPARING' WHERE to_status = 'CONFIRMED'""",
    """UPDATE order_status_history SET from_status = 'NEW' WHERE from_status = 'QUOTED'""",
    """UPDATE order_status_history SET from_status = 'PREPARING' WHERE from_status = 'CONFIRMED'""",
    """DELETE FROM settings WHERE key = 'quote.ttl_hours'""",
)

SCHEMA = (
    "ALTER TABLE orders DROP COLUMN current_quote_id",
    "DROP TABLE order_quotes",
    'DROP TYPE "QuoteStatus"',
    'ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old"',
    """CREATE TYPE "OrderStatus" AS ENUM
       ('NEW', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED')""",
    "ALTER TABLE orders ALTER COLUMN status DROP DEFAULT",
    'ALTER TABLE orders ALTER COLUMN status TYPE "OrderStatus" USING status::text::"OrderStatus"',
    "ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'NEW'",
    'ALTER TABLE order_status_history ALTER COLUMN from_status TYPE "OrderStatus" USING from_status::text::"OrderStatus"',
    'ALTER TABLE order_status_history ALTER COLUMN to_status TYPE "OrderStatus" USING to_status::text::"OrderStatus"',
    'DROP TYPE "OrderStatus_old"',
)


def upgrade() -> None:
    for stmt in (*DATA, *SCHEMA):
        op.execute(stmt)


def downgrade() -> None:
    raise NotImplementedError("0002_drop_quotes qaytarilmaydi: takliflar jadvali o'chirilgan")
