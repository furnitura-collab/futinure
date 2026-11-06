"""Import formatidagi to'liq katalog.
Eksport → tahrirlash → import qilish mumkin."""

from decimal import Decimal
from io import BytesIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.quantity import from_milli, to_milli
from app.models import PriceGroup, Product, ProductVariant
from app.modules.catalog.excel_format import COLUMN_HELP, PRODUCT_COLUMNS, SHEET_NAME, VARIANT_COLUMNS, js_number

XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _qty(d: Decimal | None) -> float | int | None:
    return None if d is None else js_number(float(from_milli(to_milli(d) or 0)))


def _num(d: Decimal | None) -> float | int | None:
    return None if d is None else js_number(float(d))


async def export_catalog(db: AsyncSession) -> bytes:
    variants = (
        await db.scalars(
            select(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .order_by(Product.code.asc().nulls_last(), ProductVariant.sku)
            .options(
                selectinload(ProductVariant.product).options(selectinload(Product.category), selectinload(Product.brand)),
                selectinload(ProductVariant.price_tiers),
                selectinload(ProductVariant.group_prices),
            )
            .execution_options(populate_existing=True)
        )
    ).all()
    groups = (await db.scalars(select(PriceGroup).order_by(PriceGroup.name))).all()

    attr_keys = sorted({k for v in variants for k in (v.attributes or {})})
    max_tiers = max([0, *(len(v.price_tiers) for v in variants)])
    columns = [
        *PRODUCT_COLUMNS,
        *VARIANT_COLUMNS,
        *(f"attr:{k}" for k in attr_keys),
        *(f"group:{g.name}" for g in groups),
        *(c for i in range(max(max_tiers, 2)) for c in (f"tier{i + 1}_qty", f"tier{i + 1}_price")),
    ]

    wb = Workbook()
    sheet = wb.active
    assert sheet is not None
    sheet.title = SHEET_NAME
    sheet.freeze_panes = "B2"
    sheet.append(columns)
    for i, c in enumerate(columns, start=1):
        sheet.column_dimensions[get_column_letter(i)].width = 36 if c in ("name_uz", "name_ru") else max(12, len(c) + 2)
        sheet.cell(row=1, column=i).font = Font(bold=True)

    for v in variants:
        p = v.product
        values: dict[str, Any] = {
            "product_code": p.code if p.code is not None else f"P-{p.id[:8]}",
            "category_slug": p.category.slug,
            "brand": p.brand.name if p.brand else None,
            "name_uz": p.name_uz,
            "name_ru": p.name_ru,
            "unit": p.unit,
            "kind": p.kind,
            "min_qty": _qty(p.min_qty),
            "qty_step": _qty(p.qty_step),
            "weight_kg": _qty(p.weight_kg),
            "volume_m3": _num(p.volume_m3),
            "board_length_mm": p.board_length_mm,
            "board_width_mm": p.board_width_mm,
            "thickness_mm": _num(p.thickness_mm),
            "sku": v.sku,
            "price": v.base_price,
            "stock": _qty(v.stock_qty),
            "low_stock": _qty(v.low_stock_threshold),
            "on_order": "ha" if v.availability == "ON_ORDER" else "yo'q",
            "lead_time_days": v.lead_time_days,
            "active": "ha" if v.is_active else "yo'q",
        }
        attrs = v.attributes or {}
        for k in attr_keys:
            values[f"attr:{k}"] = attrs.get(k)
        for g in groups:
            gp = next((x for x in v.group_prices if x.price_group_id == g.id), None)
            values[f"group:{g.name}"] = gp.price if gp else None
        for i, t in enumerate(sorted(v.price_tiers, key=lambda t: t.min_qty)):
            values[f"tier{i + 1}_qty"] = _qty(t.min_qty)
            values[f"tier{i + 1}_price"] = t.price
        sheet.append([values.get(c) for c in columns])
        # "=" bilan boshlangan matn formula emas
        for cell in sheet[sheet.max_row]:
            if isinstance(cell.value, str) and cell.value.startswith("="):
                cell.data_type = "s"

    help_sheet = wb.create_sheet("Yo'riqnoma")
    help_sheet.append(["Ustun", "Tavsif"])
    help_sheet.column_dimensions["A"].width = 28
    help_sheet.column_dimensions["B"].width = 100
    for cell in help_sheet[1]:
        cell.font = Font(bold=True)
    for col, desc in COLUMN_HELP.items():
        help_sheet.append([col, desc])

    out = BytesIO()
    wb.save(out)
    return out.getvalue()
