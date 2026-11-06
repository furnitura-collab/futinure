"""
Bildirishnoma: bazaga (ilovadagi "qo'ng'iroqcha"), real-time va push.
Baza — asosiy; push va real-time "imkon qadar" (xatosi hodisani to'xtatmaydi).
"""

import hashlib
import logging
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.serialize import row
from app.db import transaction
from app.domain.format import format_money
from app.models import DeviceToken, Notification, User, new_id, utcnow
from app.modules.notifications.messages import Template, render
from app.services import realtime
from app.services.senders import PushMessage, push_sender

log = logging.getLogger("NotificationsService")


@dataclass(frozen=True)
class Som:
    """Pul parametri: foydalanuvchi tiliga qarab formatlanadi"""

    amount: int | float


@dataclass
class NotifyInput:
    # Dublikatga qarshi kalit: bir hodisa bir foydalanuvchiga faqat bir marta
    event_id: str
    user_id: str
    type: str
    template: Template
    params: dict[str, str | Som]
    payload: dict[str, Any] = field(default_factory=dict)


def stable_uuid(key: str) -> str:
    """Matndan barqaror UUID (outbox'siz eslatmalar uchun dublikat kaliti)"""
    h = hashlib.sha1(key.encode()).hexdigest()
    return f"{h[0:8]}-{h[8:12]}-5{h[13:16]}-8{h[17:20]}-{h[20:32]}"


async def notify(db: AsyncSession, n: NotifyInput) -> bool:
    """True — yangi bildirishnoma yozildi (takroriy hodisa yoki nofaol foydalanuvchi — False)"""
    user = await db.get(User, n.user_id)
    if not user or not user.is_active:
        return False
    devices = list(await db.scalars(select(DeviceToken.token).where(DeviceToken.user_id == n.user_id)))

    locale = user.locale
    params = {k: v if isinstance(v, str) else format_money(v.amount, locale) for k, v in n.params.items()}
    title, body = render(n.template, locale, params)
    async with transaction(db):
        res = await db.execute(
            insert(Notification)
            .values(
                id=new_id(),
                event_id=n.event_id,
                user_id=n.user_id,
                type=n.type,
                title=title,
                body=body,
                payload=n.payload,
                created_at=utcnow(),
            )
            .on_conflict_do_nothing()
        )
    if not res.rowcount:  # type: ignore[attr-defined]
        return False  # takroriy hodisa — allaqachon yuborilgan

    created = await db.scalar(select(Notification).where(Notification.event_id == n.event_id, Notification.user_id == n.user_id))
    await realtime.to_user(n.user_id, realtime.NOTIFICATION, created)

    if devices:
        try:
            invalid = await push_sender().send(
                [PushMessage(to=t, title=title, body=body, data={"type": n.type, **n.payload}) for t in devices]
            )
            if invalid:
                async with transaction(db):
                    await db.execute(delete(DeviceToken).where(DeviceToken.token.in_(invalid)))
        except Exception as e:
            log.warning("Push yuborilmadi: %s", e)
    return True


async def list_notifications(db: AsyncSession, user_id: str, page: int, limit: int) -> dict[str, Any]:
    rows = await db.scalars(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    items = [row(x, exclude=("event_id",)) for x in rows]
    total = await db.scalar(select(func.count()).select_from(Notification).where(Notification.user_id == user_id)) or 0
    unread = (
        await db.scalar(
            select(func.count()).select_from(Notification).where(Notification.user_id == user_id, Notification.read_at.is_(None))
        )
        or 0
    )
    return {"items": items, "total": total, "page": page, "limit": limit, "unread": unread}


async def mark_read(db: AsyncSession, user_id: str, ids: list[str] | None) -> dict[str, int]:
    conds: list[Any] = [Notification.user_id == user_id, Notification.read_at.is_(None)]
    if ids is not None:
        conds.append(Notification.id.in_(ids))
    async with transaction(db):
        res = await db.execute(update(Notification).where(*conds).values(read_at=utcnow()))
    return {"updated": res.rowcount or 0}  # type: ignore[attr-defined]
