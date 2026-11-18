from typing import Annotated

from fastapi import File, UploadFile

from app.auth.permissions import Can
from app.core.files import read_upload
from app.core.http import api_router
from app.db import Db, transaction
from app.services.storage import MAX_IMAGE_BYTES, MAX_RECEIPT_BYTES, save_catalog_image, save_private, upload_json

CatalogEdit = Can("catalog.edit")
ChatUploader = Can("orders.chat", "CUSTOMER")

router = api_router(tags=["uploads"])

CHAT_PURPOSE = "CHAT"


@router.post("/admin/uploads/images", status_code=201)
async def catalog_image(
    _: CatalogEdit,
    file: Annotated[UploadFile | None, File()] = None,
):
    """Katalog rasmlari (ochiq). URL har doim /uploads/catalog/... — Supabase'da bo'lsa main.py yo'naltiradi"""
    buf = await read_upload(file, MAX_IMAGE_BYTES)
    url = await save_catalog_image(buf)
    return {"url": url, "size": len(buf)}


@router.post("/uploads/chat", status_code=201)
async def chat_attachment(
    user: ChatUploader,
    db: Db,
    file: Annotated[UploadFile | None, File()] = None,
):
    """Chat ilovasi (rasm/PDF) — yopiq, faqat shu buyurtma ishtirokchilari ko'radi"""
    buf = await read_upload(file, MAX_RECEIPT_BYTES)
    async with transaction(db):
        upload = await save_private(db, user.id, CHAT_PURPOSE, buf)
    return upload_json(upload)
