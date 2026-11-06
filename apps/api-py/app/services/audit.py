from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.serialize import dump
from app.models import AuditLog

_MISSING: Any = object()


async def audit(
    db: AsyncSession,
    *,
    actor_id: str | None,
    entity: str,
    entity_id: str,
    action: str,
    before: Any = _MISSING,
    after: Any = _MISSING,
) -> None:
    """
    Kim, nimani, qachon o'zgartirdi. O'zgarish bilan bir tranzaksiyada yoziladi —
    o'zgarish bekor bo'lsa, log ham qolmaydi. before/after JSON'ga javobdagidek aylanadi.
    """
    db.add(
        AuditLog(
            actor_id=actor_id,
            entity=entity,
            entity_id=entity_id,
            action=action,
            before=None if before is _MISSING else dump(before),
            after=None if after is _MISSING else dump(after),
        )
    )
    await db.flush()
