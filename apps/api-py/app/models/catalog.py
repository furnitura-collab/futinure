"""Katalog: kategoriya, brend, mahsulot, variant, narx, qoldiq, ombor."""

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, Boolean, Float, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import (
    AVAILABILITY,
    PRICE_CHANGE_SOURCE,
    PRODUCT_KIND,
    STOCK_MOVEMENT_TYPE,
    UNIT,
    Base,
    Uuid,
    created_at,
    fk,
    pk,
    qty,
    updated_at,
)

if TYPE_CHECKING:
    from app.models.users import PriceGroup

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
