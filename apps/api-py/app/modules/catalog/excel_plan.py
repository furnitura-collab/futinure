"""Excel import: oraliq tiplar (qator, reja, kontekst)."""

import re
from dataclasses import dataclass, field
from typing import Any

from app.models import Product, ProductVariant

Issue = dict[str, Any]  # {row, column?, message}

TIER_QTY = re.compile(r"^tier(\d+)_qty$")
TIER_ANY = re.compile(r"^tier\d+_(qty|price)$")


@dataclass
class VariantRow:
    row: int
    sku: str
    base_price: int
    attributes: dict[str, str | int | float]
    # None — ustun bo'sh, qoldiq o'zgarmaydi
    stock: str | None
    low_stock: str | None
    on_order: bool | None
    lead_time_days: int | None
    is_active: bool
    # None — faylda tier ustunlari yo'q, pog'onalarga tegilmaydi
    tiers: list[tuple[str, int]] | None
    # guruh nomi → narx (None = o'chirish). Faqat faylda bor guruh ustunlari
    group_prices: dict[str, int | None]


@dataclass
class ProductPlan:
    code: str
    row: int
    data: dict[str, Any]
    variants: list[VariantRow] = field(default_factory=list)


@dataclass
class Context:
    category_by_slug: dict[str, str]
    brand_by_name: dict[str, str]
    group_by_name: dict[str, str]
    product_by_code: dict[str, Product]
    variant_by_sku: dict[str, ProductVariant]


@dataclass
class Sheet:
    """O'qilgan varaq: faqat qiymati bor qatorlar (ExcelJS eachRow / actualRowCount kabi)"""

    rows: list[tuple[int, tuple[Any, ...]]]

    @property
    def actual_row_count(self) -> int:
        return len(self.rows)

    def row(self, n: int) -> tuple[Any, ...]:
        return next((vals for num, vals in self.rows if num == n), ())


def empty_summary() -> dict[str, Any]:
    return {
        "productsCreated": 0,
        "productsUpdated": 0,
        "variantsCreated": 0,
        "variantsUpdated": 0,
        "priceChanges": 0,
        "stockChanges": 0,
        "brandsCreated": [],
    }
