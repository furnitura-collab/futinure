"""Rollar ruxsatlari — super admin jadvalni ko'radi va o'zgartiradi (docs/15-roles-permissions-prompt.md)"""

from typing import Annotated, Any

from fastapi import Body
from sqlalchemy import select

from app.auth import permissions as perms
from app.auth.permissions import Can
from app.core.errors import AppError
from app.core.http import api_router
from app.db import Db, transaction
from app.models import Setting, utcnow
from app.services.audit import audit

StaffManage = Can("staff.manage")

router = api_router("/admin/access", tags=["access"])


async def _stored(db: Db) -> Any:
    return await db.scalar(select(Setting.value).where(Setting.key == perms.SETTING_KEY))


def _view(matrix: dict[str, list[str]]) -> dict[str, Any]:
    return {
        "permissions": list(perms.PERMISSIONS),
        "roles": list(perms.EDITABLE_ROLES),
        "matrix": matrix,
        "defaults": perms.defaults(),
        "superAdminOnly": sorted(perms.SUPER_ADMIN_ONLY),
    }


@router.get("/roles")
async def roles(_: StaffManage, db: Db):
    return _view(perms.normalize(await _stored(db)))


@router.put("/roles")
async def save_roles(u: StaffManage, db: Db, matrix: Annotated[dict[str, list[str]], Body(embed=True)]):
    """Faqat tahrirlanadigan rollar; noma'lum ruxsat — 422; super admin va qulflangan ruxsatlar o'zgarmaydi"""
    unknown = sorted({p for ps in matrix.values() for p in ps} - set(perms.PERMISSIONS))
    roles_bad = sorted(set(matrix) - set(perms.EDITABLE_ROLES))
    if unknown or roles_bad:
        raise AppError("INVALID_PERMISSIONS", "Noma'lum rol yoki ruxsat", 422, {"permissions": unknown, "roles": roles_bad})
    clean = perms.normalize(matrix)
    async with transaction(db):
        row = await db.get(Setting, perms.SETTING_KEY)
        before = perms.normalize(row.value if row else None)
        if row:
            row.value, row.updated_at = clean, utcnow()
        else:
            db.add(Setting(key=perms.SETTING_KEY, value=clean))
        await audit(db, actor_id=u.id, entity="access", entity_id=perms.SETTING_KEY, action="roles", before=before, after=clean)
    perms.apply(clean)
    return _view(clean)
