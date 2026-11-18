"""Nasiya (CREDIT to'lov sharti) va kredit limiti olib tashlandi.

- customer_profiles.credit_limit, payment_term_days va orders.due_date o'chiriladi (faqat nasiya uchun edi).
- Qabul qilinmagan (NEW) buyurtmada saqlangan CREDIT sharti tozalanadi — menejer boshqa shartni tanlaydi.
- Tarix o'zgarmaydi: eski nasiya buyurtmalari "PaymentTerms" enum'idagi CREDIT bilan qoladi (yangisiga tanlanmaydi).
Qaytarishda ustunlar bo'sh (0 / NULL) bo'lib tiklanadi — limit va muddat qiymatlari qaytmaydi.

Revision ID: 0003_drop_credit
Revises: 0002_drop_quotes
Create Date: 2026-11-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_drop_credit"
down_revision: str | None = "0002_drop_quotes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """UPDATE orders SET payment_terms = NULL, advance_amount = 0, allowed_methods = '{}'
           WHERE status = 'NEW' AND payment_terms = 'CREDIT'"""
    )
    op.drop_column("orders", "due_date")
    op.drop_column("customer_profiles", "credit_limit")
    op.drop_column("customer_profiles", "payment_term_days")


def downgrade() -> None:
    op.add_column("customer_profiles", sa.Column("payment_term_days", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("customer_profiles", sa.Column("credit_limit", sa.BigInteger(), nullable=False, server_default="0"))
    op.add_column("orders", sa.Column("due_date", sa.Date(), nullable=True))
