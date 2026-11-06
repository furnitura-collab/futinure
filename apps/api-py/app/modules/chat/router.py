"""
Buyurtma ichidagi chat: mijoz ↔ menejerlar.
Mijoz va menejer bir xil yo'llardan foydalanadi: /orders/:id/messages. Kim nimani ko'ra olishini access() tekshiradi.
"""

from typing import Annotated, Any

from fastapi import Depends, Query
from pydantic import BeforeValidator, model_validator
from sqlalchemy import and_, exists, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import AuthUser, require_roles
from app.core.errors import AppError
from app.core.http import api_router
from app.core.params import UuidPath
from app.core.schemas import Schema, Uuid, custom_error, trimmed
from app.core.serialize import row
from app.db import Db, transaction
from app.models import ChatMessage, Order, Upload, User, utcnow
from app.modules.uploads.router import CHAT_PURPOSE
from app.services.outbox import add_event
from app.services.storage import private_file_response

router = api_router(tags=["chat"])

Participant = Annotated[AuthUser, Depends(require_roles("CUSTOMER", "MANAGER", "SUPER_ADMIN"))]


def is_staff(u: AuthUser) -> bool:
    return u.role in ("MANAGER", "SUPER_ADMIN")


class ChatMessageInput(Schema):
    text: trimmed(1, 4000) | None = None  # type: ignore[valid-type]
    attachment_upload_id: Uuid | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> ChatMessageInput:
        if not (self.text or self.attachment_upload_id):
            raise custom_error("EMPTY_MESSAGE")
        return self


def _limit(v: Any) -> int:
    """Zod: z.coerce.number().int().min(1).max(100)"""
    try:
        n = float(v.strip() or 0) if isinstance(v, str) else float(v)
    except ValueError:
        n = float("nan")
    if n != n:
        raise custom_error("Invalid input: expected number, received NaN")
    if not n.is_integer():
        raise custom_error("Invalid input: expected int, received number")
    if n < 1:
        raise custom_error("Too small: expected number to be >=1")
    if n > 100:
        raise custom_error("Too big: expected number to be <=100")
    return int(n)


class ChatListQuery(Schema):
    """Eskiroq xabarlarni yuklash: before — eng eski ko'rilgan xabar id'si"""

    before: Uuid | None = None
    limit: Annotated[int, BeforeValidator(_limit)] = 50


_INCLUDE = (selectinload(ChatMessage.sender), selectinload(ChatMessage.attachment))


def message_json(m: ChatMessage) -> dict[str, Any]:
    """include: sender { id, fullName, role }, attachment { id, mimeType, size }"""
    a = m.attachment
    return row(
        m,
        sender={"id": m.sender.id, "fullName": m.sender.full_name, "role": m.sender.role},
        attachment=a and {"id": a.id, "mimeType": a.mime_type, "size": a.size},
    )


async def access(db: AsyncSession, order_id: str, viewer: AuthUser) -> None:
    customer_id = await db.scalar(select(Order.customer_id).where(Order.id == order_id))
    allowed = customer_id is not None and (is_staff(viewer) or (viewer.role == "CUSTOMER" and customer_id == viewer.id))
    if not allowed:
        raise AppError.not_found("Buyurtma")


@router.get("/orders/{id}/messages")
async def list_messages(u: Participant, id: UuidPath, q: Annotated[ChatListQuery, Query()], db: Db):
    await access(db, id, u)
    conds: list[Any] = [ChatMessage.order_id == id]
    if q.before:
        ref = (
            await db.execute(
                select(ChatMessage.created_at, ChatMessage.id).where(ChatMessage.id == q.before, ChatMessage.order_id == id)
            )
        ).first()
        if ref:
            conds.append(
                or_(
                    ChatMessage.created_at < ref.created_at,
                    and_(ChatMessage.created_at == ref.created_at, ChatMessage.id < ref.id),
                )
            )
    rows = list(
        await db.scalars(
            select(ChatMessage)
            .options(*_INCLUDE)
            .where(*conds)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(q.limit + 1)
        )
    )
    has_more = len(rows) > q.limit
    # Ekranda eskidan yangiga
    return {"items": [message_json(m) for m in reversed(rows[: q.limit])], "hasMore": has_more}


@router.post("/orders/{id}/messages", status_code=201)
async def send(u: Participant, id: UuidPath, body: ChatMessageInput, db: Db):
    async with transaction(db):
        await access(db, id, u)
        if body.attachment_upload_id:
            upload_id = await db.scalar(
                select(Upload.id).where(
                    Upload.id == body.attachment_upload_id, Upload.owner_id == u.id, Upload.purpose == CHAT_PURPOSE
                )
            )
            if not upload_id:
                raise AppError.not_found("Fayl")
            used = await db.scalar(select(exists().where(ChatMessage.attachment_upload_id == upload_id)))
            if used:
                raise AppError("ATTACHMENT_ALREADY_USED", "Fayl boshqa xabarga biriktirilgan", 409)
        now = utcnow()
        m = ChatMessage(
            order_id=id,
            sender_id=u.id,
            text=body.text,
            attachment_upload_id=body.attachment_upload_id,
            # O'z xabari o'zi uchun o'qilgan
            read_by_staff_at=now if is_staff(u) else None,
            read_by_customer_at=None if is_staff(u) else now,
        )
        db.add(m)
        await db.flush()
        await add_event(db, "chat.message", {"messageId": m.id})
        m = await db.scalar(
            select(ChatMessage).options(*_INCLUDE).where(ChatMessage.id == m.id).execution_options(populate_existing=True)
        )
        assert m is not None
        result = message_json(m)
    return result


@router.post("/orders/{id}/messages/read")
async def mark_read(u: Participant, id: UuidPath, db: Db):
    """Qarshi tomonning barcha xabarlarini o'qilgan deb belgilaydi"""
    async with transaction(db):
        await access(db, id, u)
        staff = is_staff(u)
        if staff:
            cond = and_(
                ChatMessage.read_by_staff_at.is_(None),
                ChatMessage.sender_id.in_(select(User.id).where(User.role == "CUSTOMER")),
            )
            values = {"read_by_staff_at": utcnow()}
        else:
            cond = and_(
                ChatMessage.read_by_customer_at.is_(None),
                ChatMessage.sender_id.in_(select(User.id).where(User.role != "CUSTOMER")),
            )
            values = {"read_by_customer_at": utcnow()}
        res = await db.execute(
            update(ChatMessage)
            .where(ChatMessage.order_id == id, cond)
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        count = res.rowcount or 0  # type: ignore[attr-defined]
        if count:
            await add_event(db, "chat.read", {"orderId": id, "readerRole": "STAFF" if staff else "CUSTOMER"})
    return {"updated": count}


@router.get("/chat/messages/{id}/attachment")
async def attachment(u: Participant, id: UuidPath, db: Db):
    m = await db.scalar(select(ChatMessage).options(selectinload(ChatMessage.attachment)).where(ChatMessage.id == id))
    if not m:
        raise AppError.not_found("Xabar")
    await access(db, m.order_id, u)
    if not m.attachment:
        raise AppError.not_found("Fayl")
    return private_file_response(m.attachment)
