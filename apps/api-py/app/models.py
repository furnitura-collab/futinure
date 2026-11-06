"""
Ma'lumotlar modeli — bazadagi sxema bilan aynan bir xil (alembic/: jadval, ustun, enum nomlari).
Pul — int (BIGINT, so'm). Miqdor — Decimal (NUMERIC(12,3)). Id — UUIDv7, ilovada yaratiladi (Prisma uuid(7) kabi).

Munosabatlar lazy="raise": async'da yashirin so'rov bo'lmasin — kerakli joyda selectinload/joinedload.
"""

import uuid
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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
ORDER_STATUS = pg_enum(
    "OrderStatus", "NEW", "QUOTED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED"
)
DELIVERY_TYPE = pg_enum("DeliveryType", "DELIVERY", "PICKUP")
PAYMENT_TERMS = pg_enum("PaymentTerms", "PREPAID", "ADVANCE", "ON_DELIVERY", "CREDIT")
PAYMENT_METHOD = pg_enum("PaymentMethod", "CASH", "CARD_TRANSFER", "CLICK", "PAYME", "BANK_TRANSFER")
PAYMENT_STATUS = pg_enum("PaymentStatus", "PENDING", "CONFIRMED", "REJECTED")
QUOTE_STATUS = pg_enum("QuoteStatus", "PENDING", "ACCEPTED", "REJECTED", "SUPERSEDED", "EXPIRED")
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


# ───────────────────────── Foydalanuvchilar ─────────────────────────


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = pk()
    phone: Mapped[str] = mapped_column(Text, unique=True)
    full_name: Mapped[str | None] = mapped_column("full_name", Text)
    # scrypt; None — parol hali o'rnatilmagan. Hech qachon javobga tushmaydi
    password_hash: Mapped[str | None] = mapped_column("password_hash", Text)
    role: Mapped[str] = mapped_column(ROLE, default="CUSTOMER")
    locale: Mapped[str] = mapped_column(LOCALE, default="uz")
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column("last_login_at", Tz)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    customer_profile: Mapped[CustomerProfile | None] = relationship(back_populates="user", lazy="raise", uselist=False)
    addresses: Mapped[list[Address]] = relationship(back_populates="user", lazy="raise")


class CustomerProfile(Base):
    __tablename__ = "customer_profiles"

    user_id: Mapped[str] = mapped_column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    type: Mapped[str] = mapped_column(CUSTOMER_TYPE, default="INDIVIDUAL")
    company_name: Mapped[str | None] = mapped_column("company_name", Text)
    inn: Mapped[str | None] = mapped_column(Text)
    bank_details: Mapped[Any | None] = mapped_column("bank_details", JSONB)
    price_group_id: Mapped[str | None] = fk("price_groups.id", nullable=True, name="price_group_id")
    credit_limit: Mapped[int] = mapped_column("credit_limit", BigInteger, default=0)
    payment_term_days: Mapped[int] = mapped_column("payment_term_days", Integer, default=0)
    allowed_payment_methods: Mapped[list[str]] = mapped_column(
        "allowed_payment_methods", ARRAY(PAYMENT_METHOD), default=lambda: ["CASH", "CARD_TRANSFER"]
    )
    # Ledger yig'indisi. Musbat = mijoz qarzdor, manfiy = haqdor
    balance_cached: Mapped[int] = mapped_column("balance_cached", BigInteger, default=0)
    updated_at: Mapped[datetime] = updated_at()

    user: Mapped[User] = relationship(back_populates="customer_profile", lazy="raise")
    price_group: Mapped[PriceGroup | None] = relationship(lazy="raise")


class PriceGroup(Base):
    __tablename__ = "price_groups"

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(Text, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[str] = pk()
    user_id: Mapped[str] = fk("users.id", ondelete="CASCADE", name="user_id")
    label: Mapped[str | None] = mapped_column(Text)
    address_text: Mapped[str] = mapped_column("address_text", Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    floor: Mapped[int | None] = mapped_column(Integer)
    needs_loaders: Mapped[bool] = mapped_column("needs_loaders", Boolean, default=False)
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()

    user: Mapped[User] = relationship(back_populates="addresses", lazy="raise")


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[str] = pk()
    phone: Mapped[str] = mapped_column(Text)
    code_hash: Mapped[str] = mapped_column("code_hash", Text)
    expires_at: Mapped[datetime] = mapped_column("expires_at", Tz)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used_at: Mapped[datetime | None] = mapped_column("used_at", Tz)
    created_at: Mapped[datetime] = created_at()


class RefreshSession(Base):
    """Refresh token'lar. Token o'zi saqlanmaydi, faqat hash. Har refresh'da rotatsiya."""

    __tablename__ = "refresh_sessions"

    id: Mapped[str] = pk()
    user_id: Mapped[str] = fk("users.id", ondelete="CASCADE", name="user_id")
    token_hash: Mapped[str] = mapped_column("token_hash", Text, unique=True)
    # Bir login'dan tug'ilgan token'lar zanjiri. Eski token qayta ishlatilsa — butun oila bekor qilinadi
    family_id: Mapped[str] = mapped_column("family_id", Uuid)
    expires_at: Mapped[datetime] = mapped_column("expires_at", Tz)
    revoked_at: Mapped[datetime | None] = mapped_column("revoked_at", Tz)
    user_agent: Mapped[str | None] = mapped_column("user_agent", Text)
    created_at: Mapped[datetime] = created_at()

    user: Mapped[User] = relationship(lazy="raise")


class DeviceToken(Base):
    __tablename__ = "device_tokens"

    id: Mapped[str] = pk()
    user_id: Mapped[str] = fk("users.id", ondelete="CASCADE", name="user_id")
    token: Mapped[str] = mapped_column(Text, unique=True)
    platform: Mapped[str] = mapped_column(Text)
    last_seen_at: Mapped[datetime] = mapped_column("last_seen_at", Tz, default=utcnow)


# ───────────────────────── Katalog ─────────────────────────


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = pk()
    parent_id: Mapped[str | None] = fk("categories.id", nullable=True, name="parent_id")
    name_uz: Mapped[str] = mapped_column("name_uz", Text)
    name_ru: Mapped[str] = mapped_column("name_ru", Text)
    slug: Mapped[str] = mapped_column(Text, unique=True)
    image_url: Mapped[str | None] = mapped_column("image_url", Text)
    sort_order: Mapped[int] = mapped_column("sort_order", Integer, default=0)
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    parent: Mapped[Category | None] = relationship(remote_side="Category.id", back_populates="children", lazy="raise")
    children: Mapped[list[Category]] = relationship(back_populates="parent", lazy="raise")


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(Text, unique=True)
    logo_url: Mapped[str | None] = mapped_column("logo_url", Text)
    created_at: Mapped[datetime] = created_at()


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = pk()
    # Excel import'da variantlarni bitta mahsulotga guruhlash kaliti
    code: Mapped[str | None] = mapped_column(Text, unique=True)
    category_id: Mapped[str] = fk("categories.id", name="category_id")
    brand_id: Mapped[str | None] = fk("brands.id", nullable=True, name="brand_id")
    name_uz: Mapped[str] = mapped_column("name_uz", Text)
    name_ru: Mapped[str] = mapped_column("name_ru", Text)
    description_uz: Mapped[str | None] = mapped_column("description_uz", Text)
    description_ru: Mapped[str | None] = mapped_column("description_ru", Text)
    unit: Mapped[str] = mapped_column(UNIT)
    min_qty: Mapped[Decimal] = qty("min_qty", default=Decimal(1))
    qty_step: Mapped[Decimal] = qty("qty_step", default=Decimal(1))
    weight_kg: Mapped[Decimal | None] = qty("weight_kg", nullable=True, precision=(10, 3))
    volume_m3: Mapped[Decimal | None] = qty("volume_m3", nullable=True, precision=(10, 4))
    kind: Mapped[str] = mapped_column(PRODUCT_KIND, default="GOODS")
    board_length_mm: Mapped[int | None] = mapped_column("board_length_mm", Integer)
    board_width_mm: Mapped[int | None] = mapped_column("board_width_mm", Integer)
    thickness_mm: Mapped[Decimal | None] = qty("thickness_mm", nullable=True, precision=(5, 1))
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    category: Mapped[Category] = relationship(lazy="raise")
    brand: Mapped[Brand | None] = relationship(lazy="raise")
    images: Mapped[list[ProductImage]] = relationship(
        back_populates="product", lazy="raise", order_by="ProductImage.sort_order", cascade="all, delete-orphan"
    )
    variants: Mapped[list[ProductVariant]] = relationship(back_populates="product", lazy="raise", cascade="all, delete-orphan")


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[str] = pk()
    product_id: Mapped[str] = fk("products.id", ondelete="CASCADE", name="product_id")
    url: Mapped[str] = mapped_column(Text)
    sort_order: Mapped[int] = mapped_column("sort_order", Integer, default=0)

    product: Mapped[Product] = relationship(back_populates="images", lazy="raise")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id: Mapped[str] = pk()
    product_id: Mapped[str] = fk("products.id", ondelete="CASCADE", name="product_id")
    sku: Mapped[str] = mapped_column(Text, unique=True)
    attributes: Mapped[Any] = mapped_column(JSONB, default=dict)
    swatch_url: Mapped[str | None] = mapped_column("swatch_url", Text)
    base_price: Mapped[int] = mapped_column("base_price", BigInteger)
    stock_qty: Mapped[Decimal] = qty("stock_qty", default=Decimal(0))
    reserved_qty: Mapped[Decimal] = qty("reserved_qty", default=Decimal(0))
    low_stock_threshold: Mapped[Decimal] = qty("low_stock_threshold", default=Decimal(0))
    # ON_ORDER qo'lda qo'yiladi. Qolganlari qoldiqdan hisoblanadi
    availability: Mapped[str] = mapped_column(AVAILABILITY, default="IN_STOCK")
    lead_time_days: Mapped[int | None] = mapped_column("lead_time_days", Integer)
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()

    product: Mapped[Product] = relationship(back_populates="variants", lazy="raise")
    price_tiers: Mapped[list[VariantPriceTier]] = relationship(
        back_populates="variant", lazy="raise", cascade="all, delete-orphan"
    )
    group_prices: Mapped[list[VariantGroupPrice]] = relationship(
        back_populates="variant", lazy="raise", cascade="all, delete-orphan"
    )


class VariantPriceTier(Base):
    __tablename__ = "variant_price_tiers"

    id: Mapped[str] = pk()
    variant_id: Mapped[str] = fk("product_variants.id", ondelete="CASCADE", name="variant_id")
    min_qty: Mapped[Decimal] = qty("min_qty")
    price: Mapped[int] = mapped_column(BigInteger)

    variant: Mapped[ProductVariant] = relationship(back_populates="price_tiers", lazy="raise")


class VariantGroupPrice(Base):
    __tablename__ = "variant_group_prices"

    variant_id: Mapped[str] = mapped_column(
        "variant_id", Uuid, ForeignKey("product_variants.id", ondelete="CASCADE"), primary_key=True
    )
    price_group_id: Mapped[str] = mapped_column(
        "price_group_id", Uuid, ForeignKey("price_groups.id", ondelete="CASCADE"), primary_key=True
    )
    price: Mapped[int] = mapped_column(BigInteger)

    variant: Mapped[ProductVariant] = relationship(back_populates="group_prices", lazy="raise")
    price_group: Mapped[PriceGroup] = relationship(lazy="raise")


class PriceHistory(Base):
    __tablename__ = "price_history"

    id: Mapped[str] = pk()
    variant_id: Mapped[str] = fk("product_variants.id", ondelete="CASCADE", name="variant_id")
    old_price: Mapped[int] = mapped_column("old_price", BigInteger)
    new_price: Mapped[int] = mapped_column("new_price", BigInteger)
    source: Mapped[str] = mapped_column(PRICE_CHANGE_SOURCE)
    changed_by: Mapped[str | None] = mapped_column("changed_by", Uuid)
    created_at: Mapped[datetime] = created_at()


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[str] = pk()
    variant_id: Mapped[str] = fk("product_variants.id", name="variant_id")
    type: Mapped[str] = mapped_column(STOCK_MOVEMENT_TYPE)
    # ADJUST'da ishorali (inventarizatsiya farqi), qolganlarida musbat
    qty: Mapped[Decimal] = qty()
    order_id: Mapped[str | None] = fk("orders.id", nullable=True, name="order_id")
    reason: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str | None] = mapped_column("user_id", Uuid)
    created_at: Mapped[datetime] = created_at()

    variant: Mapped[ProductVariant] = relationship(lazy="raise")


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[str] = pk()
    name: Mapped[str] = mapped_column(Text)
    address_text: Mapped[str] = mapped_column("address_text", Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    phone: Mapped[str | None] = mapped_column(Text)
    work_hours: Mapped[str | None] = mapped_column("work_hours", Text)
    is_active: Mapped[bool] = mapped_column("is_active", Boolean, default=True)
    created_at: Mapped[datetime] = created_at()


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
    current_quote_id: Mapped[str | None] = mapped_column(
        "current_quote_id", Uuid, ForeignKey("order_quotes.id", use_alter=True), unique=True
    )
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
    current_quote: Mapped[OrderQuote | None] = relationship(foreign_keys=[current_quote_id], lazy="raise", post_update=True)
    items: Mapped[list[OrderItem]] = relationship(
        back_populates="order", lazy="raise", order_by="OrderItem.created_at", foreign_keys="OrderItem.order_id"
    )
    quotes: Mapped[list[OrderQuote]] = relationship(
        back_populates="order", lazy="raise", foreign_keys="OrderQuote.order_id", order_by="OrderQuote.version"
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


class OrderQuote(Base):
    __tablename__ = "order_quotes"

    id: Mapped[str] = pk()
    order_id: Mapped[str] = fk("orders.id", ondelete="CASCADE", name="order_id")
    version: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[str] = mapped_column("created_by", Uuid)
    changes: Mapped[Any] = mapped_column(JSONB)
    totals: Mapped[Any] = mapped_column(JSONB)
    payment_terms: Mapped[str] = mapped_column("payment_terms", PAYMENT_TERMS)
    advance_amount: Mapped[int] = mapped_column("advance_amount", BigInteger, default=0)
    allowed_methods: Mapped[list[str]] = mapped_column("allowed_methods", ARRAY(PAYMENT_METHOD))
    manager_note: Mapped[str | None] = mapped_column("manager_note", Text)
    status: Mapped[str] = mapped_column(QUOTE_STATUS, default="PENDING")
    customer_comment: Mapped[str | None] = mapped_column("customer_comment", Text)
    responded_at: Mapped[datetime | None] = mapped_column("responded_at", Tz)
    expires_at: Mapped[datetime] = mapped_column("expires_at", Tz)
    created_at: Mapped[datetime] = created_at()

    order: Mapped[Order] = relationship(back_populates="quotes", lazy="raise", foreign_keys=[order_id])


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


# ───────────────────────── Kommunikatsiya va tizim ─────────────────────────


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[str] = pk()
    order_id: Mapped[str] = fk("orders.id", ondelete="CASCADE", name="order_id")
    sender_id: Mapped[str] = fk("users.id", name="sender_id")
    text: Mapped[str | None] = mapped_column(Text)
    attachment_upload_id: Mapped[str | None] = mapped_column("attachment_upload_id", Uuid, ForeignKey("uploads.id"), unique=True)
    read_by_customer_at: Mapped[datetime | None] = mapped_column("read_by_customer_at", Tz)
    read_by_staff_at: Mapped[datetime | None] = mapped_column("read_by_staff_at", Tz)
    created_at: Mapped[datetime] = created_at()

    sender: Mapped[User] = relationship(lazy="raise")
    attachment: Mapped[Upload | None] = relationship(lazy="raise")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = pk()
    user_id: Mapped[str] = fk("users.id", ondelete="CASCADE", name="user_id")
    # Qaysi outbox hodisasidan — qayta ishlashda dublikat bo'lmasin
    event_id: Mapped[str | None] = mapped_column("event_id", Uuid)
    type: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    payload: Mapped[Any] = mapped_column(JSONB, default=dict)
    read_at: Mapped[datetime | None] = mapped_column("read_at", Tz)
    created_at: Mapped[datetime] = created_at()


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = pk()
    actor_id: Mapped[str | None] = fk("users.id", nullable=True, name="actor_id")
    entity: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str] = mapped_column("entity_id", Text)
    action: Mapped[str] = mapped_column(Text)
    before: Mapped[Any | None] = mapped_column(JSONB)
    after: Mapped[Any | None] = mapped_column(JSONB)
    ip: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()


class Upload(Base):
    """Yopiq fayllar (to'lov cheklari). Statik berilmaydi — faqat ruxsat tekshiruvi bilan"""

    __tablename__ = "uploads"

    id: Mapped[str] = pk()
    owner_id: Mapped[str] = fk("users.id", name="owner_id")
    purpose: Mapped[str] = mapped_column(Text)
    storage_path: Mapped[str] = mapped_column("storage_path", Text)
    mime_type: Mapped[str] = mapped_column("mime_type", Text)
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = created_at()


class OutboxEvent(Base):
    """Transactional outbox: hodisa o'zgarish bilan bir tranzaksiyada yoziladi, dispatcher tarqatadi"""

    __tablename__ = "outbox_events"

    id: Mapped[str] = pk()
    type: Mapped[str] = mapped_column(Text)
    payload: Mapped[Any] = mapped_column(JSONB)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    last_error: Mapped[str | None] = mapped_column("last_error", Text)
    next_attempt_at: Mapped[datetime] = mapped_column("next_attempt_at", Tz, default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column("processed_at", Tz)
    created_at: Mapped[datetime] = created_at()


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[Any] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = updated_at()
