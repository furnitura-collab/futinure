"""Modellar uchun umumiy: Base, enum'lar, ustun yordamchilari."""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Numeric
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    # Prisma kabi millisekund aniqlikda — JSON'dagi vaqt bazadagi bilan bir xil bo'lsin
    now = datetime.now(UTC)
    return now.replace(microsecond=now.microsecond // 1000 * 1000)


def new_id() -> str:
    return str(uuid.uuid7())


def pg_enum(name: str, *values: str) -> SAEnum:
    return SAEnum(*values, name=name, create_type=False, native_enum=True, validate_strings=True)


ROLE = pg_enum("Role", "CUSTOMER", "MANAGER", "SUPER_ADMIN", "WAREHOUSE", "DRIVER")
LOCALE = pg_enum("Locale", "uz", "ru", "en")
CUSTOMER_TYPE = pg_enum("CustomerType", "INDIVIDUAL", "MASTER", "COMPANY")
UNIT = pg_enum("Unit", "PIECE", "SHEET", "METER", "SQM", "KG", "SET", "PACK")
PRODUCT_KIND = pg_enum("ProductKind", "GOODS", "BOARD", "EDGE")
AVAILABILITY = pg_enum("Availability", "IN_STOCK", "ON_ORDER", "OUT_OF_STOCK")
ORDER_STATUS = pg_enum("OrderStatus", "NEW", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED")
DELIVERY_TYPE = pg_enum("DeliveryType", "DELIVERY", "PICKUP")
PAYMENT_TERMS = pg_enum("PaymentTerms", "PREPAID", "ADVANCE", "ON_DELIVERY", "CREDIT")
PAYMENT_METHOD = pg_enum("PaymentMethod", "CASH", "CARD_TRANSFER", "CLICK", "PAYME", "BANK_TRANSFER")
PAYMENT_STATUS = pg_enum("PaymentStatus", "PENDING", "CONFIRMED", "REJECTED")
LEDGER_TYPE = pg_enum("LedgerType", "DEBIT", "CREDIT", "ADJUSTMENT", "REFUND")
STOCK_MOVEMENT_TYPE = pg_enum("StockMovementType", "IN", "OUT", "ADJUST", "RESERVE", "RELEASE")
ORDER_ITEM_STATUS = pg_enum("OrderItemStatus", "ACTIVE", "REMOVED")
PRICE_CHANGE_SOURCE = pg_enum("PriceChangeSource", "MANUAL", "BULK", "IMPORT")
CUTTING_LIST_STATUS = pg_enum("CuttingListStatus", "DRAFT", "PRICED", "IN_WORK", "DONE")
GRAIN = pg_enum("Grain", "ALONG", "ACROSS", "ANY")
DELIVERY_STATUS = pg_enum("DeliveryStatus", "ASSIGNED", "IN_TRANSIT", "DELIVERED", "FAILED")

Uuid = UUID(as_uuid=False)
Tz = DateTime(timezone=True)


def pk() -> Mapped[str]:
    return mapped_column(Uuid, primary_key=True, default=new_id)


def fk(target: str, *, nullable: bool = False, ondelete: str | None = None, name: str) -> Mapped[Any]:
    return mapped_column(name, Uuid, ForeignKey(target, ondelete=ondelete), nullable=nullable)


def created_at() -> Mapped[datetime]:
    return mapped_column("created_at", Tz, default=utcnow, nullable=False)


def updated_at() -> Mapped[datetime]:
    return mapped_column("updated_at", Tz, default=utcnow, onupdate=utcnow, nullable=False)


def qty(name: str | None = None, *, default: Decimal | None = None, nullable: bool = False, precision=(12, 3)) -> Mapped[Any]:
    args = (name,) if name else ()
    return mapped_column(*args, Numeric(*precision), default=default, nullable=nullable)


class Base(DeclarativeBase):
    pass
