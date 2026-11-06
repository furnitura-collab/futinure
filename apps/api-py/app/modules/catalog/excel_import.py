"""
Excel'dan katalog import.
Avval dry-run (commit=False) — nima o'zgarishini ko'rsatadi.
Kamida bitta xato bo'lsa hech narsa saqlanmaydi (hammasi yoki hech narsa).
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from io import BytesIO
from typing import Any

import openpyxl
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import decimal_str
from app.db import transaction
from app.domain.quantity import from_milli, to_milli
from app.models import (
    Brand,
    Category,
    PriceGroup,
    PriceHistory,
    Product,
    ProductVariant,
    StockMovement,
    VariantGroupPrice,
    VariantPriceTier,
    utcnow,
)
from app.modules.catalog.excel_format import (
    MAX_ROWS,
    PRODUCT_COLUMNS,
    REQUIRED_COLUMNS,
    SHEET_NAME,
    VARIANT_COLUMNS,
    Parsed,
    attr_value,
    cell_text,
    js_number,
    parse_bool,
    parse_decimal,
    parse_int0,
    parse_kind,
    parse_money,
    parse_qty,
    parse_unit,
    stable_json,
)
from app.services.audit import audit

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


async def import_catalog(db: AsyncSession, buf: bytes, commit: bool, actor: AuthUser) -> dict[str, Any]:
    sheet = _read_sheet(buf)
    errors: list[Issue] = []
    warnings: list[Issue] = []

    header = _read_header(sheet, errors)
    if errors:
        return _result(False, 0, errors, warnings)

    plans = _parse_rows(sheet, header, errors, warnings)
    row_count = max(0, sheet.actual_row_count - 1)
    if errors:
        return _result(False, row_count, errors, warnings)

    ctx = await _load_context(db, plans)
    summary = _diff(plans, ctx, header, errors, warnings)
    if errors or not commit:
        return _result(False, row_count, errors, warnings, summary)

    await _apply(db, plans, ctx, summary, actor)
    return _result(True, row_count, errors, warnings, summary)


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


# ───────────── Bazadagi holat bilan solishtirish ─────────────


async def _load_context(db: AsyncSession, plans: list[ProductPlan]) -> Context:
    skus = [v.sku for p in plans for v in p.variants]
    categories = (await db.execute(select(Category.id, Category.slug))).all()
    brands = (await db.execute(select(Brand.id, Brand.name))).all()
    groups = (await db.execute(select(PriceGroup.id, PriceGroup.name))).all()
    products = (
        await db.scalars(
            select(Product).where(Product.code.in_([p.code for p in plans])).execution_options(populate_existing=True)
        )
    ).all()
    variants = (
        await db.scalars(
            select(ProductVariant)
            .where(func.lower(ProductVariant.sku).in_([s.lower() for s in skus]))
            .options(
                selectinload(ProductVariant.product),
                selectinload(ProductVariant.price_tiers),
                selectinload(ProductVariant.group_prices),
            )
            .execution_options(populate_existing=True)
        )
    ).all()
    product_by_code: dict[str, Product] = {p.code: p for p in products if p.code is not None}
    variant_by_sku = {v.sku.upper(): v for v in variants}

    # Kodsiz mahsulot (admin panelda yaratilgan): SKU orqali topib, fayldagi kodni beramiz
    for plan in plans:
        if plan.code in product_by_code:
            continue
        adopted = next(
            (
                ev.product
                for v in plan.variants
                if (ev := variant_by_sku.get(v.sku.upper())) is not None and ev.product.code is None
            ),
            None,
        )
        if adopted is not None:
            product_by_code[plan.code] = adopted

    return Context(
        category_by_slug={c.slug: c.id for c in categories},
        brand_by_name={b.name.lower(): b.id for b in brands},
        group_by_name={g.name.lower(): g.id for g in groups},
        product_by_code=product_by_code,
        variant_by_sku=variant_by_sku,
    )


def _norm_qty(d: Decimal) -> str:
    return from_milli(to_milli(d) or 0)


def _product_fields(p: Product) -> dict[str, Any]:
    """Bazadagi mahsulotni import formatidagi ko'rinishga keltiradi (o'zgarish bor-yo'qligini aniqlash uchun)"""
    return {
        "categoryId": p.category_id,
        "brandId": p.brand_id,
        "nameUz": p.name_uz,
        "nameRu": p.name_ru,
        "unit": p.unit,
        "kind": p.kind,
        "minQty": _norm_qty(p.min_qty),
        "qtyStep": _norm_qty(p.qty_step),
        "weightKg": None if p.weight_kg is None else _norm_qty(p.weight_kg),
        "volumeM3": None if p.volume_m3 is None else js_number(float(p.volume_m3)),
        "boardLengthMm": p.board_length_mm,
        "boardWidthMm": p.board_width_mm,
        "thicknessMm": None if p.thickness_mm is None else js_number(float(p.thickness_mm)),
    }


def _product_input(plan: ProductPlan, ctx: Context) -> dict[str, Any]:
    d = plan.data
    brand = d["brand"]
    return {
        "categoryId": ctx.category_by_slug.get(d["categorySlug"]),
        "brandId": (ctx.brand_by_name.get(brand.lower()) or f"new:{brand}") if brand else None,
        "nameUz": d["nameUz"],
        "nameRu": d["nameRu"],
        "unit": d["unit"],
        "kind": d["kind"],
        "minQty": d["minQty"],
        "qtyStep": d["qtyStep"],
        "weightKg": d["weightKg"],
        "volumeM3": d["volumeM3"],
        "boardLengthMm": d["boardLengthMm"],
        "boardWidthMm": d["boardWidthMm"],
        "thicknessMm": d["thicknessMm"],
    }


def _diff(
    plans: list[ProductPlan], ctx: Context, header: dict[str, int], errors: list[Issue], warnings: list[Issue]
) -> dict[str, Any]:
    summary = empty_summary()
    has_stock = "stock" in header

    for col in header:
        if col.startswith("group:") and col[6:].lower() not in ctx.group_by_name:
            errors.append({"row": 1, "column": col, "message": f'"{col[6:]}" narx guruhi topilmadi'})

    for plan in plans:
        d = plan.data
        if d["categorySlug"] not in ctx.category_by_slug:
            errors.append(
                {"row": plan.row, "column": "category_slug", "message": f'"{d["categorySlug"]}" kategoriyasi topilmadi'}
            )
        brand = d["brand"]
        if brand and brand.lower() not in ctx.brand_by_name and brand not in summary["brandsCreated"]:
            summary["brandsCreated"].append(brand)
            warnings.append({"row": plan.row, "column": "brand", "message": f'"{brand}" brendi yangi — yaratiladi'})

        product = ctx.product_by_code.get(plan.code)
        if product is None:
            summary["productsCreated"] += 1
        elif product.code != plan.code or stable_json(_product_fields(product)) != stable_json(_product_input(plan, ctx)):
            summary["productsUpdated"] += 1

        for v in plan.variants:
            existing = ctx.variant_by_sku.get(v.sku.upper())
            if existing is None:
                summary["variantsCreated"] += 1
                if v.stock and (to_milli(v.stock) or 0) > 0:
                    summary["stockChanges"] += 1
                continue
            owner = ctx.product_by_code.get(plan.code)
            if existing.product_id != (owner.id if owner else None):
                errors.append(
                    {
                        "row": v.row,
                        "column": "sku",
                        "message": f"SKU boshqa mahsulotga tegishli (product_code: {existing.product.code or 'kodsiz'})",
                    }
                )
                continue
            if existing.base_price != v.base_price:
                summary["priceChanges"] += 1
            if has_stock and v.stock is not None and existing.stock_qty != Decimal(v.stock):
                if existing.reserved_qty > Decimal(v.stock):
                    errors.append(
                        {
                            "row": v.row,
                            "column": "stock",
                            "message": f"Qoldiq band qilingan miqdordan ({decimal_str(existing.reserved_qty)}) kam bo'lolmaydi",
                        }
                    )
                summary["stockChanges"] += 1
            if _variant_changed(existing, v, ctx):
                summary["variantsUpdated"] += 1
    return summary


def _variant_changed(existing: ProductVariant, v: VariantRow, ctx: Context) -> bool:
    if existing.base_price != v.base_price:
        return True
    if stable_json(existing.attributes) != stable_json(v.attributes):
        return True
    if existing.is_active != v.is_active:
        return True
    if v.low_stock is not None and existing.low_stock_threshold != Decimal(v.low_stock):
        return True
    if v.on_order is not None and (existing.availability == "ON_ORDER") != v.on_order:
        return True
    if v.lead_time_days != existing.lead_time_days and v.lead_time_days is not None:
        return True
    if v.tiers is not None:
        a = sorted(f"{_norm_qty(t.min_qty)}:{t.price}" for t in existing.price_tiers)
        b = sorted(f"{q}:{p}" for q, p in v.tiers)
        if ",".join(a) != ",".join(b):
            return True
    for name, price in v.group_prices.items():
        group_id = ctx.group_by_name.get(name.lower())
        current = next((g.price for g in existing.group_prices if g.price_group_id == group_id), None)
        if current != price:
            return True
    return False


# ───────────── Saqlash ─────────────


def _product_columns(input: dict[str, Any], code: str) -> dict[str, Any]:
    return {
        "category_id": input["categoryId"],
        "brand_id": input["brandId"],
        "name_uz": input["nameUz"],
        "name_ru": input["nameRu"],
        "unit": input["unit"],
        "kind": input["kind"],
        "min_qty": Decimal(input["minQty"]),
        "qty_step": Decimal(input["qtyStep"]),
        "weight_kg": None if input["weightKg"] is None else Decimal(input["weightKg"]),
        "volume_m3": None if input["volumeM3"] is None else Decimal(str(input["volumeM3"])),
        "board_length_mm": input["boardLengthMm"],
        "board_width_mm": input["boardWidthMm"],
        "thickness_mm": None if input["thicknessMm"] is None else Decimal(str(input["thicknessMm"])),
        "code": code,
    }


async def _apply(db: AsyncSession, plans: list[ProductPlan], ctx: Context, summary: dict[str, Any], actor: AuthUser) -> None:
    async with transaction(db):
        for name in summary["brandsCreated"]:
            brand = Brand(name=name)
            db.add(brand)
            await db.flush()
            ctx.brand_by_name[name.lower()] = brand.id

        for plan in plans:
            columns = _product_columns(_product_input(plan, ctx), plan.code)
            existing = ctx.product_by_code.get(plan.code)
            if existing is not None:
                for k, v in columns.items():
                    setattr(existing, k, v)
                existing.updated_at = utcnow()
                product = existing
            else:
                product = Product(**columns)
                db.add(product)
            await db.flush()

            for v in plan.variants:
                await _apply_variant(db, product.id, v, ctx, actor)

        await audit(db, actor_id=actor.id, entity="catalog", entity_id="import", action="excel_import", after=summary)


async def _apply_variant(db: AsyncSession, product_id: str, v: VariantRow, ctx: Context, actor: AuthUser) -> None:
    existing = ctx.variant_by_sku.get(v.sku.upper())
    base: dict[str, Any] = {"attributes": v.attributes, "base_price": v.base_price, "is_active": v.is_active}
    if v.low_stock is not None:
        base["low_stock_threshold"] = Decimal(v.low_stock)
    if v.lead_time_days is not None:
        base["lead_time_days"] = v.lead_time_days
    if v.on_order is not None:
        base["availability"] = "ON_ORDER" if v.on_order else "IN_STOCK"

    if existing is None:
        created = ProductVariant(**base, product_id=product_id, sku=v.sku)
        db.add(created)
        await db.flush()
        variant_id = created.id
        if v.stock and (to_milli(v.stock) or 0) > 0:
            created.stock_qty = Decimal(v.stock)
            db.add(
                StockMovement(
                    variant_id=variant_id,
                    type="IN",
                    qty=Decimal(v.stock),
                    reason="Excel import (boshlang'ich qoldiq)",
                    user_id=actor.id,
                )
            )
            await db.flush()
    else:
        variant_id = existing.id
        # Eski qiymatlar — o'zgartirishdan oldin
        old_price, old_stock = existing.base_price, existing.stock_qty
        for k, val in base.items():
            setattr(existing, k, val)
        existing.updated_at = utcnow()
        await db.flush()
        if old_price != v.base_price:
            db.add(
                PriceHistory(
                    variant_id=variant_id, old_price=old_price, new_price=v.base_price, source="IMPORT", changed_by=actor.id
                )
            )
        if v.stock is not None and old_stock != Decimal(v.stock):
            delta = Decimal(v.stock) - old_stock
            # Import va buyurtma bir vaqtda rezervni o'zgartirsa ham CHECK cheklovi himoya qiladi
            await db.execute(
                update(ProductVariant)
                .where(ProductVariant.id == variant_id)
                .values(stock_qty=ProductVariant.stock_qty + delta, updated_at=utcnow())
            )
            db.add(
                StockMovement(
                    variant_id=variant_id, type="ADJUST", qty=delta, reason="Excel import (inventarizatsiya)", user_id=actor.id
                )
            )
        await db.flush()

    if v.tiers is not None:
        await db.execute(delete(VariantPriceTier).where(VariantPriceTier.variant_id == variant_id))
        if v.tiers:
            await db.execute(
                insert(VariantPriceTier),
                [{"variant_id": variant_id, "min_qty": Decimal(q), "price": p} for q, p in v.tiers],
            )
    for name, price in v.group_prices.items():
        price_group_id = ctx.group_by_name[name.lower()]
        if price is None:
            await db.execute(
                delete(VariantGroupPrice).where(
                    VariantGroupPrice.variant_id == variant_id, VariantGroupPrice.price_group_id == price_group_id
                )
            )
        else:
            stmt = pg_insert(VariantGroupPrice).values(variant_id=variant_id, price_group_id=price_group_id, price=price)
            await db.execute(
                stmt.on_conflict_do_update(
                    index_elements=[VariantGroupPrice.variant_id, VariantGroupPrice.price_group_id], set_={"price": price}
                )
            )


def _result(
    committed: bool,
    rows: int,
    errors: list[Issue],
    warnings: list[Issue],
    summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "committed": committed,
        "rows": rows,
        "summary": summary or empty_summary(),
        "errors": sorted(errors, key=lambda e: e["row"])[:500],
        "warnings": warnings[:200],
    }
