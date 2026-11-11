"""Yetkazish: zona, transport, slot, yetkazish."""

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import DELIVERY_STATUS, Base, Tz, Uuid, created_at, fk, pk, qty, updated_at

if TYPE_CHECKING:
    from app.models.orders import Order
    from app.models.system import Upload
    from app.models.users import User

# ───────────────────────── Yetkazish ─────────────────────────


class DeliveryZone(Base):
    __tablename__ = "delivery_zones"

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(Text)
    polygon: Mapped[Any] = mapped_column(JSONB)
    # { "DAMAS": 80000, "LABO": 120000 }
    prices: Mapped[Any] = mapped_column(JSONB)
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    created_at: Mapped[datetime] = created_at()


class VehicleType(Base):
    __tablename__ = "vehicle_types"

    code: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    max_weight_kg: Mapped[int] = mapped_column("max_weight_kg", Integer)
    max_volume_m3: Mapped[Decimal] = qty("max_volume_m3", precision=(6, 2))
    max_length_mm: Mapped[int] = mapped_column("max_length_mm", Integer)
    sort_order: Mapped[int] = mapped_column("sort_order", Integer, default=0)


class DeliverySlot(Base):
    __tablename__ = "delivery_slots"

    id: Mapped[str] = pk()
    weekday: Mapped[int] = mapped_column(Integer)
    start_time: Mapped[str] = mapped_column("start_time", Text)
    end_time: Mapped[str] = mapped_column("end_time", Text)
    capacity: Mapped[int] = mapped_column(Integer)


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[str] = pk()
    order_id: Mapped[str] = mapped_column("order_id", Uuid, ForeignKey("orders.id", ondelete="CASCADE"), unique=True)
    driver_id: Mapped[str | None] = fk("users.id", nullable=True, name="driver_id")
    vehicle_type: Mapped[str | None] = mapped_column("vehicle_type", Text)
    zone_id: Mapped[str | None] = fk("delivery_zones.id", nullable=True, name="zone_id")
    scheduled_date: Mapped[date | None] = mapped_column("scheduled_date", Date)
    slot: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(DELIVERY_STATUS, default="ASSIGNED")
    # Topshirish surati (yopiq fayl)
    proof_upload_id: Mapped[str | None] = mapped_column("proof_upload_id", Uuid, ForeignKey("uploads.id"), unique=True)
    receiver_name: Mapped[str | None] = mapped_column("receiver_name", Text)
    # Haydovchi topshirishda olgan naqd pul (kassaga topshirilguncha PENDING to'lov)
    cash_collected: Mapped[int | None] = mapped_column("cash_collected", BigInteger)
    assigned_by: Mapped[str | None] = mapped_column("assigned_by", Uuid)
    delivered_at: Mapped[datetime | None] = mapped_column("delivered_at", Tz)
    fail_reason: Mapped[str | None] = mapped_column("fail_reason", Text)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    order: Mapped[Order] = relationship(back_populates="delivery", lazy="raise")
    driver: Mapped[User | None] = relationship(lazy="raise")
    proof: Mapped[Upload | None] = relationship(lazy="raise")
