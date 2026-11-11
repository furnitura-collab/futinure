"""Excel import: bazadagi holat bilan solishtirish."""

from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.serialize import decimal_str
from app.domain.quantity import from_milli, to_milli
from app.models import Brand, Category, PriceGroup, Product, ProductVariant
from app.modules.catalog.excel_format import js_number, stable_json
from app.modules.catalog.excel_plan import Context, Issue, ProductPlan, VariantRow, empty_summary

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
