from fastapi import UploadFile

from app.core.errors import AppError


async def read_upload(file: UploadFile | None, max_bytes: int) -> bytes:
    """
    Multer (FileInterceptor) xatti-harakati: fayl yo'q — 422 FILE_REQUIRED, katta — 413 PAYLOAD_TOO_LARGE.
    Endpoint parametri: `file: UploadFile | None = File(None)`.
    """
    if file is None:
        raise AppError("FILE_REQUIRED", '"file" maydoni bo\'sh', 422)
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise AppError("PAYLOAD_TOO_LARGE", "File too large", 413)
    return data
