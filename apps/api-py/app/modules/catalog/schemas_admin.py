"""Katalog sxemalari: admin (katalog, narx va ombor)."""

from typing import Annotated, Any, ClassVar, Literal

from pydantic import AfterValidator, BeforeValidator, Field, StrictBool

from app.core.schemas import BoolQuery, Money, PositiveQty, Qty, Schema, Uuid, custom_error, trimmed
from app.modules.catalog.schemas_types import (
    JsInt,
    JsNumber,
    Name,
    OptionalText,
    PartialSchema,
    ProductKind,
    Slug,
    Unit,
    Url500,
    _js_type,
    _range,
    _regex,
)

# ───────── Admin: katalog ─────────


class CategoryInput(PartialSchema):
    parent_id: Uuid | None = None
    name_uz: Name
    name_ru: Name
    slug: Slug
    image_url: Url500 | None = None
    sort_order: JsInt = 0
    is_active: StrictBool = True


class CategoryUpdate(CategoryInput):
    PATCH: ClassVar[bool] = True
    name_uz: Name = None  # type: ignore[assignment]
    name_ru: Name = None  # type: ignore[assignment]
    slug: Slug = None  # type: ignore[assignment]


class BrandInput(PartialSchema):
    name: trimmed(1, 100)  # type: ignore[valid-type]
    logo_url: Url500 | None = None


class BrandUpdate(BrandInput):
    PATCH: ClassVar[bool] = True
    name: trimmed(1, 100) = None  # type: ignore[valid-type,assignment]


class PriceGroupInput(PartialSchema):
    name: trimmed(1, 60)  # type: ignore[valid-type]
    description: trimmed(0, 300) | None = None  # type: ignore[valid-type]


class PriceGroupUpdate(PriceGroupInput):
    PATCH: ClassVar[bool] = True
    name: trimmed(1, 60) = None  # type: ignore[valid-type,assignment]


class ProductInput(PartialSchema):
    # description_* — .nullable().optional(), default'siz
    NO_DEFAULT: ClassVar[frozenset[str]] = frozenset({"description_uz", "description_ru"})

    category_id: Uuid
    brand_id: Uuid | None = None
    code: trimmed(1, 64) | None = None  # type: ignore[valid-type]
    name_uz: Name
    name_ru: Name
    description_uz: OptionalText | None = None
    description_ru: OptionalText | None = None
    unit: Unit
    kind: ProductKind = "GOODS"
    min_qty: PositiveQty = "1"
    qty_step: PositiveQty = "1"
    weight_kg: Qty | None = None
    volume_m3: Annotated[JsNumber, AfterValidator(_range(0, 100))] | None = None
    board_length_mm: Annotated[JsInt, AfterValidator(_range(None, 10_000, gt=0))] | None = None
    board_width_mm: Annotated[JsInt, AfterValidator(_range(None, 10_000, gt=0))] | None = None
    thickness_mm: Annotated[JsNumber, AfterValidator(_range(None, 200, gt=0))] | None = None
    is_active: StrictBool = True


class ProductUpdate(ProductInput):
    PATCH: ClassVar[bool] = True
    category_id: Uuid = None  # type: ignore[assignment]
    name_uz: Name = None  # type: ignore[assignment]
    name_ru: Name = None  # type: ignore[assignment]
    unit: Unit = None  # type: ignore[assignment]


class AdminProductListQuery(Schema):
    page: Annotated[int, Field(ge=1)] = 1
    limit: Annotated[int, Field(ge=1, le=100)] = 20
    category_id: Uuid | None = None
    brand_id: Uuid | None = None
    q: trimmed(1, 100) | None = None  # type: ignore[valid-type]
    is_active: BoolQuery | None = None
    low_stock: BoolQuery | None = None


def _attributes(v: Any) -> dict[str, str | int | float]:
    if not isinstance(v, dict):
        raise custom_error(f"Invalid input: expected record, received {_js_type(v)}")
    for k, val in v.items():
        if not 1 <= len(k) <= 40:
            raise custom_error("Invalid key in record")
        if isinstance(val, str):
            if len(val) > 100:
                raise custom_error("Too big: expected string to have <=100 characters")
        elif isinstance(val, bool) or not isinstance(val, (int, float)):
            raise custom_error("Invalid input")
    return v


Attributes = Annotated[dict[str, Any], BeforeValidator(_attributes)]
Sku = Annotated[trimmed(1, 64), AfterValidator(_regex(r"^[A-Za-z0-9._\-/]+$", "INVALID_SKU", 64))]  # type: ignore[misc]


class VariantInput(PartialSchema):
    sku: Sku
    attributes: Attributes = Field(default_factory=dict)
    swatch_url: Url500 | None = None
    base_price: Money
    low_stock_threshold: Qty = "0"
    on_order: StrictBool = False
    lead_time_days: Annotated[JsInt, AfterValidator(_range(0, 365))] | None = None
    is_active: StrictBool = True


class VariantUpdate(VariantInput):
    PATCH: ClassVar[bool] = True
    sku: Sku = None  # type: ignore[assignment]
    base_price: Money = None  # type: ignore[assignment]


class PriceTierInput(Schema):
    min_qty: PositiveQty
    price: Money


class GroupPriceInput(Schema):
    price_group_id: Uuid
    price: Money


class ImageInput(Schema):
    url: Annotated[str, Field(min_length=1, max_length=500)]
    sort_order: JsInt = 0


class ReorderImages(Schema):
    ids: Annotated[list[Uuid], Field(max_length=50)]


# ───────── Admin: narx va ombor ─────────


def _percent(v: float) -> float:
    if v == 0:
        raise custom_error("PERCENT_ZERO")
    return v


class BulkPriceInput(Schema):
    category_id: Uuid | None = None
    brand_id: Uuid | None = None
    percent: Annotated[JsNumber, AfterValidator(_range(-50, 200)), AfterValidator(_percent)]
    round_to: Literal[1, 100, 500, 1000] = 100
    include_tiers: StrictBool = True
    include_group_prices: StrictBool = True
    # true — faqat ko'rsatadi, saqlamaydi
    dry_run: StrictBool = True

    def as_json(self) -> dict[str, Any]:
        """Zod natijasi: yuborilmagan ixtiyoriy id'lar umuman yo'q"""
        out: dict[str, Any] = {}
        if self.category_id is not None:
            out["categoryId"] = self.category_id
        if self.brand_id is not None:
            out["brandId"] = self.brand_id
        out |= {
            "percent": self.percent,
            "roundTo": self.round_to,
            "includeTiers": self.include_tiers,
            "includeGroupPrices": self.include_group_prices,
            "dryRun": self.dry_run,
        }
        return out


class StockIn(Schema):
    type: Literal["IN"]
    variant_id: Uuid
    qty: PositiveQty
    reason: trimmed(0, 300) | None = None  # type: ignore[valid-type]


class StockAdjust(Schema):
    type: Literal["ADJUST"]
    variant_id: Uuid
    # Inventarizatsiyada sanalgan haqiqiy qoldiq
    actual_qty: Qty
    reason: trimmed(3, 300)  # type: ignore[valid-type]


StockMovementInput = Annotated[StockIn | StockAdjust, Field(discriminator="type")]


class ImportCommitQuery(Schema):
    commit: BoolQuery = False
