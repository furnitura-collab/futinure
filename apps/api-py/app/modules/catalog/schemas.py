"""
Katalog sxemalari — packages/shared/src/schemas/catalog.ts nusxasi.

PATCH sxemalari (CategoryUpdate, ProductUpdate, VariantUpdate, brand/narx guruhi): `data()` — faqat yuborilgan
maydonlar. Yuborilmagan maydon o'zgarmaydi (Zod 4 `.partial()` kabi default'ga qaytmaydi).
"""

import re
from collections.abc import Callable
from typing import Annotated, Any, ClassVar, Literal

from fastapi import Request
from pydantic import AfterValidator, BaseModel, BeforeValidator, Field, StrictBool, ValidationError

from app.core.errors import AppError, validation_error
from app.core.schemas import BoolQuery, Money, PositiveQty, Qty, Schema, Uuid, custom_error, trimmed

UNITS = ("PIECE", "SHEET", "METER", "SQM", "KG", "SET", "PACK")
PRODUCT_KINDS = ("GOODS", "BOARD", "EDGE")
Unit = Literal["PIECE", "SHEET", "METER", "SQM", "KG", "SET", "PACK"]
ProductKind = Literal["GOODS", "BOARD", "EDGE"]
PRODUCT_SORTS = ("popular", "price_asc", "price_desc", "name", "new")


# ───────── Yordamchi tiplar (Zod z.number() / z.number().int()) ─────────


def _number(v: Any) -> float | int:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise custom_error(f"Invalid input: expected number, received {_js_type(v)}")
    return v


def _int(v: Any) -> int:
    v = _number(v)
    if isinstance(v, float):
        if not v.is_integer():
            raise custom_error("Invalid input: expected int, received number")
        return int(v)
    return v


def _js_type(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, str):
        return "string"
    if isinstance(v, (list, tuple)):
        return "array"
    return "object"


def _range(lo: float | None = None, hi: float | None = None, *, gt: float | None = None) -> Callable[[Any], Any]:
    def check(v: Any) -> Any:
        if gt is not None and not v > gt:
            raise custom_error(f"Too small: expected number to be >{gt:g}")
        if lo is not None and v < lo:
            raise custom_error(f"Too small: expected number to be >={lo:g}")
        if hi is not None and v > hi:
            raise custom_error(f"Too big: expected number to be <={hi:g}")
        return v

    return check


JsNumber = Annotated[float, BeforeValidator(_number)]
JsInt = Annotated[int, BeforeValidator(_int)]


def _str_max(n: int) -> Any:
    def check(v: Any) -> str:
        if not isinstance(v, str):
            raise custom_error(f"Invalid input: expected string, received {_js_type(v)}")
        if len(v) > n:
            raise custom_error(f"Too big: expected string to have <={n} characters")
        return v

    return Annotated[str, BeforeValidator(check)]


def _regex(pattern: str, message: str, max_len: int) -> Any:
    rx = re.compile(pattern)

    def check(v: str) -> str:
        if not rx.match(v):
            raise custom_error(message)
        if len(v) > max_len:
            raise custom_error(f"Too big: expected string to have <={max_len} characters")
        return v

    return check


Name = trimmed(1, 200)
OptionalText = trimmed(0, 5000)
Slug = Annotated[trimmed(), AfterValidator(_regex(r"^[a-z0-9]+(-[a-z0-9]+)*$", "INVALID_SLUG", 80))]  # type: ignore[misc]
Url500 = _str_max(500)


class PartialSchema(Schema):
    """Yaratish: yuborilgan maydonlar + default'lar. PATCH (PATCH = True): faqat yuborilgan maydonlar"""

    # Default'i yo'q maydonlar (faqat yuborilganda olinadi)
    NO_DEFAULT: ClassVar[frozenset[str]] = frozenset()
    PATCH: ClassVar[bool] = False

    def data(self) -> dict[str, Any]:
        if self.PATCH:
            return {k: getattr(self, k) for k in self.model_fields_set}
        return {k: getattr(self, k) for k in type(self).model_fields if k not in self.NO_DEFAULT or k in self.model_fields_set}


# ───────── Mijoz ─────────


class ProductListQuery(Schema):
    page: Annotated[int, Field(ge=1)] = 1
    limit: Annotated[int, Field(ge=1, le=100)] = 20
    category_id: Uuid | None = None
    brand_id: Uuid | None = None
    q: trimmed(1, 100) | None = None  # type: ignore[valid-type]
    in_stock: BoolQuery | None = None
    sort: Literal["popular", "price_asc", "price_desc", "name", "new"] = "popular"


class QuoteItem(Schema):
    variant_id: Uuid
    qty: PositiveQty


class PricingQuoteInput(Schema):
    items: Annotated[list[QuoteItem], Field(min_length=1, max_length=200)]


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


# ───────── So'rov yordamchilari ─────────


def query_model[M: BaseModel](model: type[M]) -> Callable[[Request], Any]:
    """Zod pipe kabi: butun query string bitta sxema bilan tekshiriladi (422 VALIDATION_ERROR)"""

    async def dep(request: Request) -> M:
        try:
            return model.model_validate(dict(request.query_params))
        except ValidationError as e:
            raise validation_error(list(e.errors())) from None

    return dep


UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")


def parse_uuid(value: str) -> str:
    """NestJS ParseUUIDPipe: noto'g'ri bo'lsa 400"""
    if not UUID_RE.match(value):
        raise AppError("BAD_REQUEST", "Validation failed (uuid is expected)", 400)
    return value


def invalid(path: str, message: str) -> AppError:
    """Zod refine xatosi (422 VALIDATION_ERROR, bitta issue)"""
    return AppError("VALIDATION_ERROR", "Ma'lumotlar noto'g'ri", 422, [{"path": path, "message": message}])
