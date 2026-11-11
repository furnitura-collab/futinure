"""Hodisa ishlovchilari uchun umumiy: konvert, yuklash va Telegram yordamchilari."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.serialize import row
from app.models import CustomerProfile, Order, OrderItem, Payment, User
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
