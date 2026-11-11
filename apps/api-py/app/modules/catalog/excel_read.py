"""Excel import: varaqni o'qish va qatorlarni tahlil qilish."""

from collections.abc import Callable
from io import BytesIO
from typing import Any

import openpyxl

from app.core.errors import AppError
from app.domain.quantity import to_milli
from app.modules.catalog.excel_format import (
    MAX_ROWS,
    PRODUCT_COLUMNS,
    REQUIRED_COLUMNS,
    SHEET_NAME,
    VARIANT_COLUMNS,
    Parsed,
    attr_value,
    cell_text,
    parse_bool,
    parse_decimal,
    parse_int0,
    parse_kind,
    parse_money,
    parse_qty,
    parse_unit,
    stable_json,
)
from app.modules.catalog.excel_plan import TIER_ANY, TIER_QTY, Issue, ProductPlan, Sheet, VariantRow

# ───────────── O'qish ─────────────


def _read_sheet(buf: bytes) -> Sheet:
    try:
        wb = openpyxl.load_workbook(BytesIO(buf), data_only=True)
    except Exception:
        raise AppError("INVALID_FILE", "Fayl .xlsx formatida emas", 422) from None
    ws = wb[SHEET_NAME] if SHEET_NAME in wb.sheetnames else (wb.worksheets[0] if wb.worksheets else None)
    if ws is None:
        raise AppError("INVALID_FILE", "Faylda varaq yo'q", 422)
    rows = [
        (i, vals)
        for i, vals in enumerate(ws.iter_rows(min_row=1, min_col=1, values_only=True), start=1)
        if any(v is not None for v in vals)
    ]
    sheet = Sheet(rows)
    if sheet.actual_row_count - 1 > MAX_ROWS:
        raise AppError("TOO_MANY_ROWS", f"Maksimum {MAX_ROWS} qator", 422)
    return sheet


def _read_header(sheet: Sheet, errors: list[Issue]) -> dict[str, int]:
    header: dict[str, int] = {}
    for col, value in enumerate(sheet.row(1), start=1):
        if value is None:
            continue
        raw = cell_text(value)
        # attr: va group: dan keyingi qism registrini saqlaymiz (attr:color, group:Usta)
        if ":" in raw:
            i = raw.index(":")
            name = (raw[:i].lower().strip() + raw[i:]) if i > 0 else raw
        else:
            name = raw.lower()
        if name:
            header[name] = col
    for col in REQUIRED_COLUMNS:
        if col not in header:
            errors.append({"row": 1, "column": col, "message": "Majburiy ustun yo'q"})
    return header


class _RowReader:
    """Bitta qatorni o'qish; xatolar `errors` ga yig'iladi"""

    def __init__(self, header: dict[str, int], vals: tuple[Any, ...], row_number: int) -> None:
        self.header = header
        self.vals = vals
        self.row_number = row_number
        self.errors: list[Issue] = []

    def get(self, col: str) -> str:
        idx = self.header.get(col)
        return cell_text(self.vals[idx - 1]) if idx and idx - 1 < len(self.vals) else ""

    def need(self, col: str, parsed: Parsed) -> Any:
        ok, value = parsed
        if ok:
            return value
        self.errors.append({"row": self.row_number, "column": col, "message": value})
        return None

    def required(self, col: str) -> str:
        v = self.get(col)
        if not v:
            self.errors.append({"row": self.row_number, "column": col, "message": "Bo'sh bo'lmasligi kerak"})
        return v

    def optional(self, col: str, parse: Callable[[str], Parsed]) -> Any:
        v = self.get(col)
        return None if v == "" else self.need(col, parse(v))


def _parse_rows(sheet: Sheet, header: dict[str, int], errors: list[Issue], warnings: list[Issue]) -> list[ProductPlan]:
    known = {*PRODUCT_COLUMNS, *VARIANT_COLUMNS}
    attr_cols = [k for k in header if k.startswith("attr:")]
    group_cols = [k for k in header if k.startswith("group:")]
    tier_nums = sorted((m.group(1) for k in header if (m := TIER_QTY.match(k))), key=int)
    for k in header:
        if k not in known and not k.startswith("attr:") and not k.startswith("group:") and not TIER_ANY.match(k):
            warnings.append({"row": 1, "column": k, "message": "Noma'lum ustun, e'tiborsiz qoldiriladi"})

    plans: dict[str, ProductPlan] = {}
    seen_sku: dict[str, int] = {}

    for row_number, vals in sheet.rows:
        if row_number == 1:
            continue

        r = _RowReader(header, vals, row_number)
        get, need, required, optional = r.get, r.need, r.required, r.optional
        if all(get(c) == "" for c in header):
            continue  # bo'sh qator
        row_errors = r.errors

        def or_default(v: Any, default: Any) -> Any:
            return default if v is None else v

        code = required("product_code")
        sku = required("sku")
        data: dict[str, Any] = {
            "categorySlug": required("category_slug").lower(),
            "brand": get("brand") or None,
            "nameUz": required("name_uz"),
            "nameRu": required("name_ru"),
            "unit": or_default(need("unit", parse_unit(required("unit"))), "PIECE"),
            "kind": or_default(optional("kind", parse_kind), "GOODS"),
            "minQty": or_default(optional("min_qty", parse_qty), "1"),
            "qtyStep": or_default(optional("qty_step", parse_qty), "1"),
            "weightKg": optional("weight_kg", parse_qty),
            "volumeM3": optional("volume_m3", lambda s: parse_decimal(s, 4, 100)),
            "boardLengthMm": optional("board_length_mm", lambda s: parse_int0(s, 10_000)),
            "boardWidthMm": optional("board_width_mm", lambda s: parse_int0(s, 10_000)),
            "thicknessMm": optional("thickness_mm", lambda s: parse_decimal(s, 1, 200)),
        }
        if to_milli(data["minQty"]) == 0:
            row_errors.append({"row": row_number, "column": "min_qty", "message": "0 dan katta bo'lishi kerak"})
        if to_milli(data["qtyStep"]) == 0:
            row_errors.append({"row": row_number, "column": "qty_step", "message": "0 dan katta bo'lishi kerak"})
        if data["kind"] == "BOARD" and (data["boardLengthMm"] is None or data["boardWidthMm"] is None):
            row_errors.append({"row": row_number, "column": "board_length_mm", "message": "Plita uchun uzunlik va en majburiy"})

        attributes: dict[str, str | int | float] = {}
        for col in attr_cols:
            v = get(col)
            if v != "":
                attributes[col[5:]] = attr_value(v)

        tiers: list[tuple[str, int]] | None = None
        if tier_nums:
            tiers = []
            for n in tier_nums:
                qty = get(f"tier{n}_qty")
                price = get(f"tier{n}_price")
                if not qty and not price:
                    continue
                if not qty or not price:
                    row_errors.append(
                        {"row": row_number, "column": f"tier{n}_qty", "message": "Miqdor va narx birga to'ldirilishi kerak"}
                    )
                    continue
                q = need(f"tier{n}_qty", parse_qty(qty))
                p = need(f"tier{n}_price", parse_money(price))
                if q is not None and p is not None:
                    tiers.append((q, p))
            if len({t[0] for t in tiers}) != len(tiers):
                row_errors.append(
                    {"row": row_number, "column": "tier1_qty", "message": "Pog'ona miqdorlari takrorlanmasligi kerak"}
                )

        group_prices: dict[str, int | None] = {}
        for col in group_cols:
            v = get(col)
            group_prices[col[6:]] = None if v == "" else need(col, parse_money(v))

        variant = VariantRow(
            row=row_number,
            sku=sku,
            base_price=or_default(need("price", parse_money(required("price"))), 0),
            attributes=attributes,
            stock=optional("stock", parse_qty),
            low_stock=optional("low_stock", parse_qty),
            on_order=optional("on_order", parse_bool),
            lead_time_days=optional("lead_time_days", lambda s: parse_int0(s, 365)),
            is_active=or_default(optional("active", parse_bool), True),
            tiers=tiers,
            group_prices=group_prices,
        )

        if sku:
            key = sku.upper()
            first = seen_sku.get(key)
            if first:
                row_errors.append({"row": row_number, "column": "sku", "message": f"SKU {first}-qatorda ham bor"})
            else:
                seen_sku[key] = row_number

        if row_errors:
            errors.extend(row_errors)
            continue

        existing = plans.get(code)
        if existing is None:
            plans[code] = ProductPlan(code, row_number, data, [variant])
            continue
        if stable_json(existing.data) != stable_json(data):
            errors.append(
                {
                    "row": row_number,
                    "column": "product_code",
                    "message": f'"{code}" mahsulot maydonlari {existing.row}-qatordagidan farq qiladi '
                    "(nom, birlik, kategoriya va h.k. bir xil bo'lishi kerak)",
                }
            )
            continue
        existing.variants.append(variant)

    return list(plans.values())
