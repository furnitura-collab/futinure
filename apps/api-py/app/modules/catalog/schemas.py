"""
Katalog sxemalari — packages/shared/src/schemas/catalog.ts nusxasi.

PATCH sxemalari (CategoryUpdate, ProductUpdate, VariantUpdate, brand/narx guruhi): `data()` — faqat yuborilgan
maydonlar. Yuborilmagan maydon o'zgarmaydi (Zod 4 `.partial()` kabi default'ga qaytmaydi).
"""

import re
from collections.abc import Callable
from typing import Annotated, Any, Literal

from fastapi import Request
from pydantic import BaseModel, Field, ValidationError

from app.core.errors import AppError, validation_error
from app.core.schemas import BoolQuery, PositiveQty, Schema, Uuid, trimmed
from app.modules.catalog.schemas_admin import (
    AdminProductListQuery,
    Attributes,
    BrandInput,
    BrandUpdate,
    BulkPriceInput,
    CategoryInput,
    CategoryUpdate,
    GroupPriceInput,
    ImageInput,
    ImportCommitQuery,
    PriceGroupInput,
    PriceGroupUpdate,
    PriceTierInput,
    ProductInput,
    ProductUpdate,
    ReorderImages,
    Sku,
    StockAdjust,
    StockIn,
    StockMovementInput,
    VariantInput,
    VariantUpdate,
)
from app.modules.catalog.schemas_types import (
    PRODUCT_KINDS,
    PRODUCT_SORTS,
    UNITS,
    JsInt,
    JsNumber,
    Name,
    OptionalText,
    PartialSchema,
    ProductKind,
    Slug,
    Unit,
    Url500,
)

__all__ = [
    "ProductListQuery",
    "QuoteItem",
    "PricingQuoteInput",
    "query_model",
    "UUID_RE",
    "parse_uuid",
    "invalid",
    "UNITS",
    "PRODUCT_KINDS",
    "Unit",
    "ProductKind",
    "PRODUCT_SORTS",
    "JsNumber",
    "JsInt",
    "Name",
    "OptionalText",
    "Slug",
    "Url500",
    "PartialSchema",
    "CategoryInput",
    "CategoryUpdate",
    "BrandInput",
    "BrandUpdate",
    "PriceGroupInput",
    "PriceGroupUpdate",
    "ProductInput",
    "ProductUpdate",
    "AdminProductListQuery",
    "Attributes",
    "Sku",
    "VariantInput",
    "VariantUpdate",
    "PriceTierInput",
    "GroupPriceInput",
    "ImageInput",
    "ReorderImages",
    "BulkPriceInput",
    "StockIn",
    "StockAdjust",
    "StockMovementInput",
    "ImportCommitQuery",
]


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
