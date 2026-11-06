"""
Hodisa → kanallar:
  real-time (admin panel va ochiq ilova), bildirishnoma + push (mijoz), Telegram (xodimlar guruhi).
Takroriy chaqiruvga chidamli: bildirishnoma (eventId, userId) bo'yicha bir marta; real-time takrori zararsiz.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.serialize import row
from app.domain.format import format_money
from app.models import ChatMessage, CustomerProfile, Order, OrderItem, OrderQuote, Payment, Upload, User
from app.modules.notifications.messages import DELIVERY_FAILED, READY_FOR_PICKUP, STATUS_TEXT, TEXTS
from app.modules.notifications.service import NotifyInput, Som, notify
from app.services import realtime as rt
from app.services.senders import escape_html, telegram_sender

_MISSING: Any = object()


@dataclass(frozen=True)
class OutboxEnvelope:
    id: str
    type: str
    payload: dict[str, Any]
    created_at: datetime


class EntityNotFound(LookupError):
    """Prisma findUniqueOrThrow kabi — hodisa qayta urinishga qoladi"""


# ───── yordamchilar ─────


async def _customer_card(db: AsyncSession, user_id: str) -> dict[str, Any]:
    """CUSTOMER_CARD: { id, phone, fullName, customerProfile: { companyName } | null }"""
    u = await db.get(User, user_id)
    if not u:
        raise EntityNotFound("No User found")
    profile = (await db.execute(select(CustomerProfile.company_name).where(CustomerProfile.user_id == user_id))).first()
    return {
        "id": u.id,
        "phone": u.phone,
        "fullName": u.full_name,
        "customerProfile": {"companyName": profile[0]} if profile else None,
    }


@dataclass
class _Order:
    o: Order
    customer: dict[str, Any]
    active_items: int


async def _order(db: AsyncSession, order_id: str) -> _Order:
    o = await db.get(Order, order_id)
    if not o:
        raise EntityNotFound("No Order found")
    n = await db.scalar(
        select(func.count()).select_from(OrderItem).where(OrderItem.order_id == order_id, OrderItem.status == "ACTIVE")
    )
    return _Order(o, await _customer_card(db, o.customer_id), n or 0)


@dataclass
class _Payment:
    p: Payment
    order: dict[str, Any] | None
    customer: dict[str, Any]

    def json(self) -> dict[str, Any]:
        return row(self.p, order=self.order, customer=self.customer)


async def _payment(db: AsyncSession, payment_id: str) -> _Payment:
    p = await db.get(Payment, payment_id)
    if not p:
        raise EntityNotFound("No Payment found")
    order = None
    if p.order_id:
        o = await db.get(Order, p.order_id)
        if o:
            order = {"id": o.id, "number": o.number, "paidTotal": o.paid_total, "grandTotal": o.grand_total}
    return _Payment(p, order, await _customer_card(db, p.customer_id))


async def _payment_updated(x: _Payment) -> None:
    p = x.p
    data = {"id": p.id, "status": p.status, "amount": p.amount, "orderId": p.order_id, "rejectReason": p.reject_reason}
    await rt.to_user(p.customer_id, rt.PAYMENT_UPDATED, data)
    await rt.to_staff(rt.PAYMENT_UPDATED, data)
    if p.order_id:
        await rt.to_order(p.order_id, rt.PAYMENT_UPDATED, data)


async def _role_of(db: AsyncSession, user_id: str) -> str | None:
    return await db.scalar(select(User.role).where(User.id == user_id))


def _who(c: dict[str, Any]) -> str:
    company = (c.get("customerProfile") or {}).get("companyName")
    name = ", ".join(x for x in (c.get("fullName"), company) if x)
    return f"👤 {escape_html(name or 'Ismsiz')} · {c['phone']}"


def _link(order_id: str) -> str:
    return f"{get_settings().ADMIN_URL}/orders/{order_id}"


async def _tg(html: str) -> None:
    """Telegram — imkon qadar; xatosi hodisani qayta urinishga olib kelmaydi (dublikat xabar bo'lmasin)"""
    try:
        await telegram_sender().send(html)
    except Exception:
        pass  # senders o'zi logga yozadi


# ───── hodisalar ─────


async def _order_created(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _order(db, e.payload["orderId"])
    o = x.o
    card = {
        "id": o.id,
        "number": o.number,
        "status": o.status,
        "grandTotal": o.grand_total,
        "customer": x.customer,
        "createdAt": o.created_at,
    }
    await rt.to_staff(rt.ORDER_CREATED, card)
    await _tg(
        f"🆕 <b>Yangi buyurtma {o.number}</b>\n{_who(x.customer)}\n{x.active_items} xil tovar, {format_money(o.grand_total)}\n"
        f"{'🏬 Olib ketadi' if o.delivery_type == 'PICKUP' else '🚚 Yetkazish'}\n{_link(o.id)}"
    )


async def _order_status_changed(db: AsyncSession, e: OutboxEnvelope) -> None:
    p = e.payload
    x = await _order(db, p["orderId"])
    o = x.o
    to, frm, comment = p.get("to"), p.get("from"), p.get("comment")
    data = {"orderId": o.id, "number": o.number, "from": frm, "to": to, "version": o.version}
    await rt.to_staff(rt.ORDER_STATUS_CHANGED, data)
    await rt.to_user(o.customer_id, rt.ORDER_STATUS_CHANGED, data)
    await rt.to_order(o.id, rt.ORDER_STATUS_CHANGED, data)

    failed = frm == "OUT_FOR_DELIVERY" and to == "READY"
    if failed:
        await _tg(f"🚫 <b>Yetkazilmadi: {o.number}</b>\n{_who(x.customer)}\n💬 {escape_html(comment or '')}\n{_link(o.id)}")

    actor_id = p.get("actorId", _MISSING)
    actor_role = await _role_of(db, actor_id) if isinstance(actor_id, str) and actor_id else None

    # Mijozning o'z harakati — unga emas, xodimlarga xabar
    if actor_role == "CUSTOMER":
        what = {
            "CONFIRMED": "✅ Mijoz taklifni qabul qildi",
            "NEW": "↩️ Mijoz taklifni rad etdi",
            "CANCELLED": "❌ Mijoz buyurtmani bekor qildi",
        }.get(to or "")
        if what:
            note = f"\n💬 {escape_html(comment)}" if comment else ""
            await _tg(f"{what}: <b>{o.number}</b>\n{_who(x.customer)}{note}\n{_link(o.id)}")
        return

    # QUOTED haqida mijozga "order.quote_created" xabar beradi; COMPLETED — to'lov xabari bilan
    if to in ("QUOTED", "COMPLETED"):
        return
    # NEW ga faqat taklif muddati o'tganda (tizim) qaytadi
    if to == "NEW" and actor_id is not None:
        return

    if failed:
        template = DELIVERY_FAILED
    elif to == "READY" and o.delivery_type == "PICKUP":
        template = READY_FOR_PICKUP
    else:
        template = STATUS_TEXT.get(to or "")
    if not template:
        return
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=o.customer_id,
            type="order.delivery_failed" if failed else f"order.{(to or '').lower()}",
            template=template,
            params={"number": o.number, "total": Som(o.grand_total), "comment": comment or ""},
            payload={"orderId": o.id},
        ),
    )


async def _order_quote_created(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _order(db, e.payload["orderId"])
    o = x.o
    quote_id = e.payload["quoteId"]
    totals = await db.scalar(select(OrderQuote.totals).where(OrderQuote.id == quote_id))
    if totals is None:
        raise EntityNotFound("No OrderQuote found")
    data = {"orderId": o.id, "quoteId": quote_id}
    await rt.to_user(o.customer_id, rt.ORDER_QUOTE_CREATED, data)
    await rt.to_order(o.id, rt.ORDER_QUOTE_CREATED, data)
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=o.customer_id,
            type="order.quote",
            template=TEXTS["quote"],
            # Taklifdagi yangi summa (buyurtma summasi qabul qilinganda o'zgaradi)
            params={"number": o.number, "total": Som(totals["grandTotal"])},
            payload={"orderId": o.id, "quoteId": quote_id},
        ),
    )


async def _payment_created(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _payment(db, e.payload["paymentId"])
    p = x.p
    await rt.to_staff(rt.PAYMENT_CREATED, x.json())
    head = "💵 <b>Haydovchi naqd oldi" if p.method == "CASH" else "💳 <b>Yangi chek"
    target = f"Buyurtma {x.order['number']}" if x.order else "Umumiy qarzga"
    await _tg(
        f"{head}: {format_money(p.amount)}</b>\n{_who(x.customer)}\n{target}\n{get_settings().ADMIN_URL}/payments?status=PENDING"
    )


async def _payment_confirmed(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _payment(db, e.payload["paymentId"])
    p = x.p
    await _payment_updated(x)
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=p.customer_id,
            type="payment.confirmed",
            template=TEXTS["paymentConfirmed"],
            params={"amount": Som(p.amount), "order": f" ({x.order['number']})" if x.order else ""},
            payload={"paymentId": p.id, "orderId": p.order_id},
        ),
    )


async def _payment_rejected(db: AsyncSession, e: OutboxEnvelope) -> None:
    x = await _payment(db, e.payload["paymentId"])
    p = x.p
    await _payment_updated(x)
    await notify(
        db,
        NotifyInput(
            event_id=e.id,
            user_id=p.customer_id,
            type="payment.rejected",
            template=TEXTS["paymentRejected"],
            params={"amount": Som(p.amount), "reason": p.reject_reason or ""},
            payload={"paymentId": p.id, "orderId": p.order_id},
        ),
    )


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


async def _delivery_assigned(db: AsyncSession, e: OutboxEnvelope) -> None:
    p = e.payload
    o = await db.get(Order, p["orderId"])
    if not o:
        return
    driver_id, previous = p.get("driverId"), p.get("previousDriverId")
    data = {"orderId": o.id, "driverId": driver_id}
    await rt.to_staff(rt.DELIVERY_ASSIGNED, data)
    if previous:
        await rt.to_user(previous, rt.DELIVERY_ASSIGNED, data)
    if not driver_id:
        return
    await rt.to_user(driver_id, rt.DELIVERY_ASSIGNED, data)
    snap = o.address_snapshot
    address = (snap.get("addressText") if isinstance(snap, dict) else None) or ""
    await notify(
        db,
        NotifyInput(
            # Bir buyurtma bir haydovchiga qayta biriktirilsa ham har safar xabar (hodisa id'si bo'yicha)
            event_id=e.id,
            user_id=driver_id,
            type="delivery.assigned",
            template=TEXTS["deliveryAssigned"],
            params={"number": o.number, "address": address},
            payload={"orderId": o.id},
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


HANDLERS: dict[str, Callable[[AsyncSession, OutboxEnvelope], Awaitable[None]]] = {
    "order.created": _order_created,
    "order.status_changed": _order_status_changed,
    "order.quote_created": _order_quote_created,
    "payment.created": _payment_created,
    "payment.confirmed": _payment_confirmed,
    "payment.rejected": _payment_rejected,
    "chat.message": _chat_message,
    "delivery.assigned": _delivery_assigned,
    "chat.read": _chat_read,
}


async def handle(db: AsyncSession, event: OutboxEnvelope) -> None:
    """OutboxHandler. Noma'lum tur — xato (qayta urinishga qoladi, NestJS'dagi kabi)"""
    handler = HANDLERS.get(event.type)
    if handler is None:
        raise TypeError(f"handler is not a function: {event.type}")
    await handler(db, event)
