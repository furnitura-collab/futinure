"""Hodisalar: chat xabari va o'qilganlik."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.serialize import row
from app.models import ChatMessage, Order, Upload, User
from app.modules.notifications.event_common import OutboxEnvelope
from app.modules.notifications.messages import TEXTS
from app.modules.notifications.service import NotifyInput, notify
from app.services import realtime as rt


async def _chat_message(db: AsyncSession, e: OutboxEnvelope) -> None:
    m = await db.get(ChatMessage, e.payload["messageId"])
    if not m:
        return
    sender = await db.get(User, m.sender_id)
    order = await db.get(Order, m.order_id)
    if not sender or not order:
        return
    attachment = await db.get(Upload, m.attachment_upload_id) if m.attachment_upload_id else None
    data = row(
        m,
        sender={"id": sender.id, "fullName": sender.full_name, "role": sender.role},
        attachment=attachment and {"id": attachment.id, "mimeType": attachment.mime_type, "size": attachment.size},
        orderNumber=order.number,
    )
    await rt.to_order(order.id, rt.CHAT_MESSAGE, data)

    if sender.role == "CUSTOMER":
        # Admin panelda ro'yxatdagi "o'qilmagan" belgisi uchun
        await rt.to_staff(rt.CHAT_MESSAGE, data)
        return
    await rt.to_user(order.customer_id, rt.CHAT_MESSAGE, data)
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=order.customer_id,
            type="chat.message",
            template=TEXTS["chat"],
            params={"number": order.number, "text": m.text[:120] if m.text else "📎"},
            payload={"orderId": order.id, "messageId": m.id},
        ),
    )


async def _chat_read(db: AsyncSession, e: OutboxEnvelope) -> None:
    p = e.payload
    o = await db.get(Order, p["orderId"])
    if not o:
        return
    await rt.to_order(o.id, rt.CHAT_READ, p)
    if p.get("readerRole") == "STAFF":
        await rt.to_staff(rt.CHAT_READ, p)
