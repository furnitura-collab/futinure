"""
Yo'l parametrlari — NestJS ParseUUIDPipe o'rniga:

    @router.patch("/{id}")
    async def update(user: Staff, id: UuidPath, ...): ...

Rol tekshiruvidan KEYIN e'lon qiling (Nest'da guard pipe'dan oldin ishlaydi): 403 → 400 tartibi saqlansin.
Yaroqsiz qiymat → 400 BAD_REQUEST "Validation failed (uuid is expected)".
"""

from typing import Annotated

from fastapi import Depends, Path

from app.core.errors import AppError
from app.core.schemas import UUID_RE


def _bad_uuid() -> AppError:
    return AppError("BAD_REQUEST", "Validation failed (uuid is expected)", 400)


def check_uuid(value: str) -> str:
    if not UUID_RE.match(value):
        raise _bad_uuid()
    return value


async def _id(id: Annotated[str, Path()]) -> str:
    return check_uuid(id)


def uuid_path(name: str):  # noqa: ANN201
    """Boshqa nomli parametr uchun: Annotated[str, Depends(uuid_path("itemId"))]"""

    async def dep(value: Annotated[str, Path(alias=name)]) -> str:
        return check_uuid(value)

    return dep


UuidPath = Annotated[str, Depends(_id)]
