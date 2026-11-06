"""
Fayl ombori. "catalog" — ochiq (katalog rasmlari), "private" — yopiq (cheklar, chat fayllari).
Kalit ikkalasida ham bir xil ("2026-11/uuid.jpg") — bazadagi yo'llar ombor almashsa ham o'zgarmaydi.
Lokal disk (UPLOAD_DIR/<bucket>/<key>) yoki Supabase Storage (SUPABASE_URL berilsa).
"""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, Protocol

import anyio
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import AppError
from app.models import Upload

Bucket = Literal["catalog", "private"]

MAX_RECEIPT_BYTES = 10 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
RECEIPT_PURPOSE = "RECEIPT"

FILE_TYPES = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "pdf": "application/pdf"}


def detect_file_type(buf: bytes) -> str | None:
    """Kengaytmaga emas, fayl boshidagi baytlarga qaraymiz"""
    if len(buf) < 12:
        return None
    if buf[:3] == b"\xff\xd8\xff":
        return "jpg"
    if buf[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if buf[:4] == b"RIFF" and buf[8:12] == b"WEBP":
        return "webp"
    if buf[:5] == b"%PDF-":
        return "pdf"
    return None


class FileStorage(Protocol):
    async def put(self, bucket: Bucket, key: str, body: bytes, content_type: str) -> None: ...
    def open(self, bucket: Bucket, key: str) -> AsyncIterator[bytes]: ...
    def public_url(self, key: str) -> str | None: ...


class LocalStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()

    async def put(self, bucket: Bucket, key: str, body: bytes, content_type: str) -> None:
        path = self._path(bucket, key)
        await anyio.Path(path.parent).mkdir(parents=True, exist_ok=True)
        await anyio.Path(path).write_bytes(body)

    async def open(self, bucket: Bucket, key: str) -> AsyncIterator[bytes]:
        async with await anyio.open_file(self._path(bucket, key), "rb") as f:
            while chunk := await f.read(64 * 1024):
                yield chunk

    def public_url(self, key: str) -> str | None:
        return None

    def _path(self, bucket: Bucket, key: str) -> Path:
        return self.root / bucket / key


class SupabaseStorage:
    """Supabase Storage (REST API, service_role kalit). Bucket'lar: "catalog" (Public) va "private"."""

    def __init__(self, url: str, key: str) -> None:
        self.url = url.rstrip("/")
        self.key = key

    async def put(self, bucket: Bucket, key: str, body: bytes, content_type: str) -> None:
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                f"{self.url}/storage/v1/object/{bucket}/{key}",
                headers={**self._auth(), "Content-Type": content_type, "x-upsert": "false"},
                content=body,
            )
        if res.is_error:
            raise RuntimeError(f"Supabase Storage yuklash xatosi {res.status_code}: {res.text}")

    async def open(self, bucket: Bucket, key: str) -> AsyncIterator[bytes]:
        async with httpx.AsyncClient(timeout=30) as client:
            async with client.stream("GET", f"{self.url}/storage/v1/object/{bucket}/{key}", headers=self._auth()) as res:
                if res.is_error:
                    raise RuntimeError(f"Supabase Storage o'qish xatosi {res.status_code}")
                async for chunk in res.aiter_bytes():
                    yield chunk

    def public_url(self, key: str) -> str | None:
        return f"{self.url}/storage/v1/object/public/catalog/{key}"

    def _auth(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.key}", "apikey": self.key}


_storage: FileStorage | None = None


def storage() -> FileStorage:
    global _storage
    if _storage is None:
        env = get_settings()
        _storage = (
            SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
            if env.SUPABASE_URL and env.SUPABASE_SERVICE_KEY
            else LocalStorage(env.UPLOAD_DIR)
        )
    return _storage


def _month() -> str:
    return datetime.now(UTC).strftime("%Y-%m")


async def save_catalog_image(buf: bytes) -> str:
    """Katalog rasmi (ochiq). Qaytaradi: /uploads/catalog/<key>"""
    ext = detect_file_type(buf)
    if ext not in ("jpg", "png", "webp"):
        raise AppError("UNSUPPORTED_FILE", "Faqat JPG, PNG yoki WEBP rasm", 415)
    key = f"{_month()}/{uuid.uuid4()}.{ext}"
    await storage().put("catalog", key, buf, FILE_TYPES[ext])
    return f"/uploads/catalog/{key}"


async def save_private(db: AsyncSession, owner_id: str, purpose: str, buf: bytes) -> Upload:
    """Yopiq fayl (to'lov cheki, chat, topshirish surati). "private" bucket'da, faqat API orqali beriladi"""
    ext = detect_file_type(buf)
    if not ext:
        raise AppError("UNSUPPORTED_FILE", "Faqat JPG, PNG, WEBP rasm yoki PDF", 415)
    path = f"{purpose.lower()}/{_month()}/{uuid.uuid4()}.{ext}"
    await storage().put("private", path, buf, FILE_TYPES[ext])
    upload = Upload(owner_id=owner_id, purpose=purpose, storage_path=path, mime_type=FILE_TYPES[ext], size=len(buf))
    db.add(upload)
    await db.flush()
    return upload


def upload_json(u: Upload) -> dict[str, object]:
    """PrivateFilesService.save() javobi: { id, mimeType, size, createdAt }"""
    return {"id": u.id, "mimeType": u.mime_type, "size": u.size, "createdAt": u.created_at}


def open_private(upload: Upload) -> AsyncIterator[bytes]:
    return storage().open("private", upload.storage_path)


def private_file_response(upload: Upload):  # noqa: ANN201
    """Yopiq faylni oqim bilan berish (chek, chat ilovasi, topshirish surati)"""
    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        open_private(upload),
        media_type=upload.mime_type,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": "inline",
        },
    )
