"""Mijoz buyurtmalari: ro'yxat va to'lanadigan summa."""

from collections import defaultdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.core.serialize import pick
from app.domain.customer_order import amount_due_now
from app.domain.state_machine import TERMINAL_STATUSES
from app.models import ChatMessage, Order, OrderItem, OrderQuote, Payment, User
from app.modules.orders.schemas import OrderListQuery

PREVIEW_ITEMS = 3


def amount_due(o: Any, payments: list[Any]) -> int:
    """Mijoz hozir to'lashi kerak summa — tekshirilayotgan cheklar ayirib"""
    return amount_due_now(
        status=o.status,
        payment_terms=o.payment_terms,
        grand_total=o.grand_total,
        paid_total=o.paid_total,
        advance_amount=o.advance_amount,
        due_date=o.due_date,
        pending_total=sum(p.amount for p in payments if p.status == "PENDING"),
    )


# ───────────── Ro'yxat va ko'rish ─────────────


def unread_for_customer(order_ids: Any) -> Any:
    """Mijoz o'qimagan (xodimlar yozgan) xabarlar — buyurtma bo'yicha soni"""
    sender = aliased(User)
    return (
        select(ChatMessage.order_id, func.count())
        .join(sender, sender.id == ChatMessage.sender_id)
        .where(ChatMessage.order_id.in_(order_ids), ChatMessage.read_by_customer_at.is_(None), sender.role != "CUSTOMER")
        .group_by(ChatMessage.order_id)
    )


async def list_orders(db: AsyncSession, customer_id: str, q: OrderListQuery) -> dict[str, Any]:
    conds: list[Any] = [Order.customer_id == customer_id]
    if q.active is not None:
        conds.append(Order.status.not_in(TERMINAL_STATUSES) if q.active else Order.status.in_(TERMINAL_STATUSES))
    elif q.status:
        conds.append(Order.status == q.status)

    orders = (
        await db.scalars(
            select(Order)
            .where(*conds)
            .order_by(Order.created_at.desc())
            .offset((q.page - 1) * q.limit)
            .limit(q.limit)
            .execution_options(populate_existing=True)
        )
    ).all()
    total = await db.scalar(select(func.count()).select_from(Order).where(*conds)) or 0
    ids = [o.id for o in orders]

    quote_status = dict(
        (
            await db.execute(
                select(OrderQuote.id, OrderQuote.status).where(
                    OrderQuote.id.in_([o.current_quote_id for o in orders if o.current_quote_id])
                )
            )
        ).all()  # noqa: E501
    )
    preview: dict[str, list[dict[str, Any]]] = defaultdict(list)
    counts: dict[str, int] = defaultdict(int)
    for i in (
        await db.execute(
            select(OrderItem.order_id, OrderItem.name_uz, OrderItem.name_ru, OrderItem.qty, OrderItem.unit)
            .where(OrderItem.order_id.in_(ids), OrderItem.status == "ACTIVE")
            .order_by(OrderItem.created_at, OrderItem.id)
        )
    ).all():
        counts[i.order_id] += 1
        # Kartada "nima buyurtma qilingan"ni ko'rsatish uchun birinchi tovarlar
        if len(preview[i.order_id]) < PREVIEW_ITEMS:
            preview[i.order_id].append({"nameUz": i.name_uz, "nameRu": i.name_ru, "qty": i.qty, "unit": i.unit})
    pending: dict[str, list[Any]] = defaultdict(list)
    for p in (
        await db.execute(
            select(Payment.order_id, Payment.amount, Payment.status).where(Payment.order_id.in_(ids), Payment.status == "PENDING")
        )
    ).all():
        pending[p.order_id].append(p)
    unread = dict((await db.execute(unread_for_customer(ids))).all())

    items = []
    for o in orders:
        items.append(
            {
                **pick(
                    o,
                    "id",
                    "number",
                    "status",
                    "delivery_type",
                    "grand_total",
                    "paid_total",
                    "advance_amount",
                    "payment_terms",
                    "due_date",
                    "created_at",
                ),
                "preview": preview[o.id],
                "balanceDue": o.grand_total - o.paid_total,
                "amountDue": amount_due(o, pending[o.id]),
                "itemsCount": counts[o.id],
                "unreadMessages": unread.get(o.id, 0),
                "hasPendingQuote": o.status == "QUOTED" and quote_status.get(o.current_quote_id) == "PENDING",
            }
        )
    return {"items": items, "total": total, "page": q.page, "limit": q.limit}
