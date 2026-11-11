"""To'lov va qarz (ledger)."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import LEDGER_TYPE, PAYMENT_METHOD, PAYMENT_STATUS, Base, Tz, Uuid, created_at, fk, pk, updated_at

if TYPE_CHECKING:
    from app.models.orders import Order
    from app.models.system import Upload
    from app.models.users import User

# ───────────────────────── To'lov va qarz ─────────────────────────


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = pk()
    customer_id: Mapped[str] = fk("users.id", name="customer_id")
    order_id: Mapped[str | None] = fk("orders.id", nullable=True, name="order_id")
    amount: Mapped[int] = mapped_column(BigInteger)
    method: Mapped[str] = mapped_column(PAYMENT_METHOD)
    status: Mapped[str] = mapped_column(PAYMENT_STATUS, default="PENDING")
    # Mijoz yuklagan chek (yopiq fayl)
    receipt_upload_id: Mapped[str | None] = mapped_column("receipt_upload_id", Uuid, ForeignKey("uploads.id"), unique=True)
    comment: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column("created_by", Uuid)
    confirmed_by: Mapped[str | None] = mapped_column("confirmed_by", Uuid)
    confirmed_at: Mapped[datetime | None] = mapped_column("confirmed_at", Tz)
    reject_reason: Mapped[str | None] = mapped_column("reject_reason", Text)
    external_id: Mapped[str | None] = mapped_column("external_id", Text, unique=True)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    customer: Mapped[User] = relationship(lazy="raise")
    order: Mapped[Order | None] = relationship(back_populates="payments", lazy="raise")
    receipt: Mapped[Upload | None] = relationship(lazy="raise")


class LedgerEntry(Base):
    """Faqat qo'shiladi. Tuzatish — teskari yozuv bilan"""

    __tablename__ = "ledger_entries"

    id: Mapped[str] = pk()
    customer_id: Mapped[str] = fk("users.id", name="customer_id")
    type: Mapped[str] = mapped_column(LEDGER_TYPE)
    # Ishorali: musbat — qarz oshadi (DEBIT), manfiy — kamayadi (CREDIT, REFUND)
    amount: Mapped[int] = mapped_column(BigInteger)
    order_id: Mapped[str | None] = fk("orders.id", nullable=True, name="order_id")
    payment_id: Mapped[str | None] = mapped_column("payment_id", Uuid, ForeignKey("payments.id"), unique=True)
    description: Mapped[str] = mapped_column(Text)
    balance_after: Mapped[int] = mapped_column("balance_after", BigInteger)
    created_by: Mapped[str | None] = mapped_column("created_by", Uuid)
    created_at: Mapped[datetime] = created_at()

    order: Mapped[Order | None] = relationship(lazy="raise")
    payment: Mapped[Payment | None] = relationship(lazy="raise")
