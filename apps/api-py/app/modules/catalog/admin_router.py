"""Admin katalog va ombor yo'llari"""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import Body, Depends, File, Response, UploadFile

from app.auth.deps import AuthUser, Staff, SuperAdmin, require_roles
from app.core.files import read_upload
from app.core.http import api_router
from app.core.schemas import PageQuery
from app.db import Db
from app.modules.catalog import admin, bulk_price, stock
from app.modules.catalog.excel_export import XLSX_TYPE, export_catalog
from app.modules.catalog.excel_import import import_catalog
from app.modules.catalog.schemas import (
    AdminProductListQuery,
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
    StockMovementInput,
    VariantInput,
    VariantUpdate,
    invalid,
    parse_uuid,
    query_model,
)

router = api_router("/admin", tags=["admin-catalog"])

MAX_IMPORT_BYTES = 10 * 1024 * 1024

# Omborchi ham ko'radi (kirim/inventarizatsiya uchun tovar qidirish), o'zgartira olmaydi
StaffOrWarehouse = Annotated[AuthUser, Depends(require_roles("MANAGER", "SUPER_ADMIN", "WAREHOUSE"))]


# ───── Kategoriyalar ─────
@router.get("/categories")
async def categories(_: Staff, db: Db):
    return await admin.categories(db)


@router.post("/categories", status_code=201)
async def create_category(u: Staff, body: CategoryInput, db: Db):
    return await admin.create_category(db, body, u)


@router.patch("/categories/{id}")
async def update_category(u: Staff, id: str, body: CategoryUpdate, db: Db):
    return await admin.update_category(db, parse_uuid(id), body, u)


@router.delete("/categories/{id}", status_code=204)
async def delete_category(u: Staff, id: str, db: Db):
    await admin.delete_category(db, parse_uuid(id), u)


# ───── Brendlar ─────
@router.get("/brands")
async def brands(_: Staff, db: Db):
    return await admin.brands(db)


@router.post("/brands", status_code=201)
async def create_brand(_: Staff, body: BrandInput, db: Db):
    return await admin.create_brand(db, body)


@router.patch("/brands/{id}")
async def update_brand(_: Staff, id: str, body: BrandUpdate, db: Db):
    return await admin.update_brand(db, parse_uuid(id), body)


@router.delete("/brands/{id}", status_code=204)
async def delete_brand(_: Staff, id: str, db: Db):
    await admin.delete_brand(db, parse_uuid(id))


# ───── Narx guruhlari (faqat super admin o'zgartiradi) ─────
@router.get("/price-groups")
async def price_groups(_: Staff, db: Db):
    return await admin.price_groups(db)


@router.post("/price-groups", status_code=201)
async def create_price_group(_: SuperAdmin, body: PriceGroupInput, db: Db):
    return await admin.create_price_group(db, body)


@router.patch("/price-groups/{id}")
async def update_price_group(_: SuperAdmin, id: str, body: PriceGroupUpdate, db: Db):
    return await admin.update_price_group(db, parse_uuid(id), body)


@router.delete("/price-groups/{id}", status_code=204)
async def delete_price_group(_: SuperAdmin, id: str, db: Db):
    await admin.delete_price_group(db, parse_uuid(id))


# ───── Mahsulotlar ─────
@router.get("/products")
async def products(
    _: StaffOrWarehouse, query: Annotated[AdminProductListQuery, Depends(query_model(AdminProductListQuery))], db: Db
):
    return await admin.products(db, query)


@router.get("/products/{id}")
async def product(_: StaffOrWarehouse, id: str, db: Db):
    return await admin.product(db, parse_uuid(id))


@router.post("/products", status_code=201)
async def create_product(u: Staff, body: ProductInput, db: Db):
    # Zod refine: plita uchun o'lchamlar majburiy
    if body.kind == "BOARD" and (body.board_length_mm is None or body.board_width_mm is None):
        raise invalid("boardLengthMm", "BOARD_DIMENSIONS_REQUIRED")
    return await admin.create_product(db, body, u)


@router.patch("/products/{id}")
async def update_product(u: Staff, id: str, body: ProductUpdate, db: Db):
    return await admin.update_product(db, parse_uuid(id), body, u)


@router.delete("/products/{id}", status_code=204)
async def delete_product(u: SuperAdmin, id: str, db: Db):
    await admin.delete_product(db, parse_uuid(id), u)


# ───── Variantlar ─────
@router.post("/products/{id}/variants", status_code=201)
async def create_variant(u: Staff, id: str, body: VariantInput, db: Db):
    return await admin.create_variant(db, parse_uuid(id), body, u)


@router.patch("/variants/{id}")
async def update_variant(u: Staff, id: str, body: VariantUpdate, db: Db):
    return await admin.update_variant(db, parse_uuid(id), body, u)


@router.delete("/variants/{id}", status_code=204)
async def delete_variant(u: SuperAdmin, id: str, db: Db):
    await admin.delete_variant(db, parse_uuid(id), u)


@router.put("/variants/{id}/price-tiers")
async def set_tiers(u: Staff, id: str, body: Annotated[list[PriceTierInput], Body(max_length=10)], db: Db):
    if len({t.min_qty for t in body}) != len(body):
        raise invalid("", "DUPLICATE_MIN_QTY")
    return await admin.set_price_tiers(db, parse_uuid(id), body, u)


@router.put("/variants/{id}/group-prices")
async def set_group_prices(u: Staff, id: str, body: Annotated[list[GroupPriceInput], Body(max_length=20)], db: Db):
    if len({g.price_group_id for g in body}) != len(body):
        raise invalid("", "DUPLICATE_GROUP")
    return await admin.set_group_prices(db, parse_uuid(id), body, u)


@router.get("/variants/{id}/price-history")
async def price_history(_: Staff, id: str, db: Db):
    return await admin.price_history(db, parse_uuid(id))


# ───── Rasmlar ─────
@router.post("/products/{id}/images", status_code=201)
async def add_image(_: Staff, id: str, body: ImageInput, db: Db):
    return await admin.add_image(db, parse_uuid(id), body)


@router.put("/products/{id}/images/order", status_code=204)
async def reorder_images(_: Staff, id: str, body: ReorderImages, db: Db):
    await admin.reorder_images(db, parse_uuid(id), body.ids)


@router.delete("/products/{id}/images/{image_id}", status_code=204)
async def delete_image(_: Staff, id: str, image_id: str, db: Db):
    await admin.delete_image(db, parse_uuid(id), parse_uuid(image_id))


# ───── Ommaviy narx, import/eksport ─────
@router.post("/prices/bulk-update")
async def bulk_update(u: SuperAdmin, body: BulkPriceInput, db: Db):
    return await bulk_price.run(db, body, u)


@router.post("/catalog/import")
async def catalog_import(
    u: Staff,
    query: Annotated[ImportCommitQuery, Depends(query_model(ImportCommitQuery))],
    db: Db,
    file: Annotated[UploadFile | None, File()] = None,
):
    buf = await read_upload(file, MAX_IMPORT_BYTES)
    return await import_catalog(db, buf, query.commit, u)


@router.get("/catalog/export.xlsx")
async def catalog_export(_: Staff, db: Db):
    buf = await export_catalog(db)
    day = datetime.now(UTC).date().isoformat()
    return Response(buf, media_type=XLSX_TYPE, headers={"Content-Disposition": f'attachment; filename="katalog-{day}.xlsx"'})


# ───── Ombor: omborchi ham kirim/inventarizatsiya qila oladi ─────
@router.post("/stock/movements", status_code=201)
async def stock_move(u: StaffOrWarehouse, body: StockMovementInput, db: Db):
    return await stock.move(db, body, u)


@router.get("/stock/low")
async def stock_low(_: StaffOrWarehouse, db: Db):
    return await stock.low_stock(db)


@router.get("/stock/variants/{id}/movements")
async def stock_movements(_: StaffOrWarehouse, id: str, q: PageQuery, db: Db):
    return await stock.movements(db, parse_uuid(id), q)
