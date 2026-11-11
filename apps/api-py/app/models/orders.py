"""Savat, buyurtmalar va raspil."""

from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, Date, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    CUTTING_LIST_STATUS,
    DELIVERY_TYPE,
    GRAIN,
    ORDER_ITEM_STATUS,
    ORDER_STATUS,
    PAYMENT_METHOD,
    PAYMENT_TERMS,
    UNIT,
    Base,
    Tz,
    Uuid,
    created_at,
    fk,
    pk,
    qty,
    updated_at,
)

if TYPE_CHECKING:
    from app.models.catalog import Product, ProductVariant, Warehouse
    from app.models.deliveries import Delivery
    from app.models.payments import Payment
    from app.models.users import User

# ───────────────────────── Savat ─────────────────────────


class CartItem(Base):
    __tablename__ = "cart_items"

    user_id: Mapped[str] = mapped_column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    variant_id: Mapped[str] = mapped_column(
        "variant_id", Uuid, ForeignKey("product_variants.id", ondelete="CASCADE"), primary_key=True
    )
    qty: Mapped[Decimal] = qty()
    updated_at: Mapped[datetime] = updated_at()

    variant: Mapped[ProductVariant] = relationship(lazy="raise")


class Favorite(Base):
    __tablename__ = "favorites"

    user_id: Mapped[str] = mapped_column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    product_id: Mapped[str] = mapped_column("product_id", Uuid, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = created_at()

    product: Mapped[Product] = relationship(lazy="raise")


# ───────────────────────── Buyurtmalar ─────────────────────────


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = pk()
    number: Mapped[str] = mapped_column(Text, unique=True)
    customer_id: Mapped[str] = fk("users.id", name="customer_id")
    manager_id: Mapped[str | None] = fk("users.id", nullable=True, name="manager_id")
    status: Mapped[str] = mapped_column(ORDER_STATUS, default="NEW")
    # Optimistic lock
    version: Mapped[int] = mapped_column(Integer, default=0)
    delivery_type: Mapped[str] = mapped_column("delivery_type", DELIVERY_TYPE)
    address_snapshot: Mapped[Any | None] = mapped_column("address_snapshot", JSONB)
    pickup_warehouse_id: Mapped[str | None] = fk("warehouses.id", nullable=True, name="pickup_warehouse_id")
    delivery_date: Mapped[date | None] = mapped_column("delivery_date", Date)
    delivery_slot: Mapped[str | None] = mapped_column("delivery_slot", Text)
    vehicle_type: Mapped[str | None] = mapped_column("vehicle_type", Text)
    items_total: Mapped[int] = mapped_column("items_total", BigInteger, default=0)
    services_total: Mapped[int] = mapped_column("services_total", BigInteger, default=0)
    delivery_fee: Mapped[int] = mapped_column("delivery_fee", BigInteger, default=0)
    discount_total: Mapped[int] = mapped_column("discount_total", BigInteger, default=0)
    grand_total: Mapped[int] = mapped_column("grand_total", BigInteger, default=0)
    paid_total: Mapped[int] = mapped_column("paid_total", BigInteger, default=0)
    payment_terms: Mapped[str | None] = mapped_column("payment_terms", PAYMENT_TERMS)
    advance_amount: Mapped[int] = mapped_column("advance_amount", BigInteger, default=0)
    allowed_methods: Mapped[list[str]] = mapped_column("allowed_methods", ARRAY(PAYMENT_METHOD), default=list)
    due_date: Mapped[date | None] = mapped_column("due_date", Date)
    total_weight_kg: Mapped[Decimal] = qty("total_weight_kg", default=Decimal(0))
    total_volume_m3: Mapped[Decimal] = qty("total_volume_m3", default=Decimal(0), precision=(12, 4))
    customer_comment: Mapped[str | None] = mapped_column("customer_comment", Text)
    idempotency_key: Mapped[str] = mapped_column("idempotency_key", Text)
    cancel_reason: Mapped[str | None] = mapped_column("cancel_reason", Text)
    cancelled_by: Mapped[str | None] = mapped_column("cancelled_by", Uuid)
    confirmed_at: Mapped[datetime | None] = mapped_column("confirmed_at", Tz)
    delivered_at: Mapped[datetime | None] = mapped_column("delivered_at", Tz)
    completed_at: Mapped[datetime | None] = mapped_column("completed_at", Tz)
    cancelled_at: Mapped[datetime | None] = mapped_column("cancelled_at", Tz)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    customer: Mapped[User] = relationship(foreign_keys=[customer_id], lazy="raise")
    manager: Mapped[User | None] = relationship(foreign_keys=[manager_id], lazy="raise")
    pickup_warehouse: Mapped[Warehouse | None] = relationship(lazy="raise")
    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", lazy="raise", order_by="OrderItem.created_at", foreign_keys="OrderItem.order_id"
    )
    status_history: Mapped[list[OrderStatusHistory]] = relationship(
        back_populates="order", lazy="raise", order_by="OrderStatusHistory.created_at"
    )
    payments: Mapped[list[Payment]] = relationship(back_populates="order", lazy="raise")
    delivery: Mapped[Delivery | None] = relationship(back_populates="order", lazy="raise", uselist=False)


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = pk()
    order_id: Mapped[str] = fk("orders.id", ondelete="CASCADE", name="order_id")
    variant_id: Mapped[str] = fk("product_variants.id", name="variant_id")
    sku: Mapped[str] = mapped_column(Text)
    name_uz: Mapped[str] = mapped_column("name_uz", Text)
    name_ru: Mapped[str] = mapped_column("name_ru", Text)
    unit: Mapped[str] = mapped_column(UNIT)
    attributes: Mapped[Any] = mapped_column(JSONB, default=dict)
    requested_qty: Mapped[Decimal] = qty("requested_qty")
    qty: Mapped[Decimal] = qty()
    unit_price: Mapped[int] = mapped_column("unit_price", BigInteger)
    line_total: Mapped[int] = mapped_column("line_total", BigInteger)
    replaced_item_id: Mapped[str | None] = fk("order_items.id", nullable=True, name="replaced_item_id")
    status: Mapped[str] = mapped_column(ORDER_ITEM_STATUS, default="ACTIVE")
    created_at: Mapped[datetime] = created_at()

    order: Mapped[Order] = relationship(back_populates="items", lazy="raise", foreign_keys=[order_id])
    variant: Mapped[ProductVariant] = relationship(lazy="raise")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id: Mapped[str] = pk()
    order_id: Mapped[str] = fk("orders.id", ondelete="CASCADE", name="order_id")
    from_status: Mapped[str | None] = mapped_column("from_status", ORDER_STATUS)
    to_status: Mapped[str] = mapped_column("to_status", ORDER_STATUS)
    actor_id: Mapped[str | None] = mapped_column("actor_id", Uuid)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()

    order: Mapped[Order] = relationship(back_populates="status_history", lazy="raise")


# ───────────────────────── Raspil ─────────────────────────


class CuttingList(Base):
    __tablename__ = "cutting_lists"

    id: Mapped[str] = pk()
    order_id: Mapped[str] = fk("orders.id", ondelete="CASCADE", name="order_id")
    board_variant_id: Mapped[str] = mapped_column("board_variant_id", Uuid)
    sheets_estimated: Mapped[Decimal | None] = qty("sheets_estimated", nullable=True, precision=(10, 2))
    cut_meters: Mapped[Decimal | None] = qty("cut_meters", nullable=True, precision=(10, 2))
    edge_meters: Mapped[Decimal | None] = qty("edge_meters", nullable=True, precision=(10, 2))
    price_estimated: Mapped[int | None] = mapped_column("price_estimated", BigInteger)
    price_final: Mapped[int | None] = mapped_column("price_final", BigInteger)
    source_file_url: Mapped[str | None] = mapped_column("source_file_url", Text)
    status: Mapped[str] = mapped_column(CUTTING_LIST_STATUS, default="DRAFT")
    created_at: Mapped[datetime] = created_at()


class CuttingPart(Base):
    __tablename__ = "cutting_parts"

    id: Mapped[str] = pk()
    cutting_list_id: Mapped[str] = fk("cutting_lists.id", ondelete="CASCADE", name="cutting_list_id")
    label: Mapped[str | None] = mapped_column(Text)
    length_mm: Mapped[int] = mapped_column("length_mm", Integer)
    width_mm: Mapped[int] = mapped_column("width_mm", Integer)
    qty: Mapped[int] = mapped_column(Integer)
    grain: Mapped[str] = mapped_column(GRAIN, default="ANY")
    edge_top_variant_id: Mapped[str | None] = mapped_column("edge_top_variant_id", Uuid)
    edge_bottom_variant_id: Mapped[str | None] = mapped_column("edge_bottom_variant_id", Uuid)
    edge_left_variant_id: Mapped[str | None] = mapped_column("edge_left_variant_id", Uuid)
    edge_right_variant_id: Mapped[str | None] = mapped_column("edge_right_variant_id", Uuid)
