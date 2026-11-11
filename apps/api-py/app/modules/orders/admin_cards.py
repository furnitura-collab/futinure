"""Admin buyurtmalari: kartalar (ro'yxat va kanban)."""

import re
from typing import Any

from sqlalchemy import exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.domain.dates import day_range
from app.models import ChatMessage, CustomerProfile, Order, OrderItem, User
from app.modules.orders.schemas import AdminOrderListQuery

KANBAN_STATUSES = ("NEW", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED")
KANBAN_LIMIT = 50


# ───────────── Karta (ro'yxat va kanban) ─────────────


def _unread_for_staff(order_ids: list[str]) -> Any:
    """Xodimlar o'qimagan (mijoz yozgan) xabarlar soni"""
    sender = aliased(User)
    return (
        select(ChatMessage.order_id, func.count())
        .join(sender, sender.id == ChatMessage.sender_id)
        .where(ChatMessage.order_id.in_(order_ids), ChatMessage.read_by_staff_at.is_(None), sender.role == "CUSTOMER")
        .group_by(ChatMessage.order_id)
    )


async def _cards(db: AsyncSession, orders: list[Order]) -> list[dict[str, Any]]:
    ids = [o.id for o in orders]
    user_ids = {o.customer_id for o in orders} | {o.manager_id for o in orders if o.manager_id}
    users = {u.id: u for u in (await db.execute(select(User.id, User.phone, User.full_name).where(User.id.in_(user_ids)))).all()}
    profiles = {
        p.user_id: p
        for p in (
            await db.execute(
                select(CustomerProfile.user_id, CustomerProfile.type, CustomerProfile.company_name).where(
                    CustomerProfile.user_id.in_([o.customer_id for o in orders])
                )
            )
        ).all()
    }
    counts = dict(
        (
            await db.execute(
                select(OrderItem.order_id, func.count())
                .where(OrderItem.order_id.in_(ids), OrderItem.status == "ACTIVE")
                .group_by(OrderItem.order_id)
            )
        ).all()
    )
    unread = dict((await db.execute(_unread_for_staff(ids))).all())

    out = []
    for o in orders:
        c = users[o.customer_id]
        p = profiles.get(o.customer_id)
        m = users.get(o.manager_id) if o.manager_id else None
        out.append(
            {
                "id": o.id,
                "number": o.number,
                "status": o.status,
                "version": o.version,
                "deliveryType": o.delivery_type,
                "grandTotal": o.grand_total,
                "paidTotal": o.paid_total,
                "paymentTerms": o.payment_terms,
                "createdAt": o.created_at,
                "updatedAt": o.updated_at,
                "customer": {
                    "id": c.id,
                    "phone": c.phone,
                    "fullName": c.full_name,
                    "customerProfile": {"type": p.type, "companyName": p.company_name} if p else None,
                },
                "manager": {"id": m.id, "fullName": m.full_name} if m else None,
                "itemsCount": counts.get(o.id, 0),
                "unreadMessages": unread.get(o.id, 0),
                "balanceDue": o.grand_total - o.paid_total,
            }
        )
    return out


def _where(q: AdminOrderListQuery) -> list[Any]:
    conds: list[Any] = []
    if q.status:
        conds.append(Order.status == q.status)
    if q.manager_id:
        conds.append(Order.manager_id.is_(None) if q.manager_id == "none" else Order.manager_id == q.manager_id)
    if q.customer_id:
        conds.append(Order.customer_id == q.customer_id)
    if q.date_from or q.date_to:
        gte, lt = day_range(q.date_from, q.date_to)
        if gte:
            conds.append(Order.created_at >= gte)
        if lt:
            conds.append(Order.created_at < lt)
    if q.q:
        digits = re.sub(r"\D", "", q.q)
        like = f"%{q.q}%"
        customer = select(User.id).where(User.id == Order.customer_id).correlate(Order)
        ors: list[Any] = [
            Order.number.ilike(like),
            customer.where(User.full_name.ilike(like)).exists(),
            exists()
            .where(CustomerProfile.user_id == Order.customer_id, CustomerProfile.company_name.ilike(like))
            .correlate(Order),
        ]
        if len(digits) >= 4:
            ors.append(customer.where(User.phone.like(f"%{digits}%")).exists())
        conds.append(or_(*ors))
    return conds


async def _fetch(db: AsyncSession, conds: list[Any], order_by: Any, offset: int | None, limit: int) -> list[Order]:
    stmt = select(Order).where(*conds).order_by(order_by).limit(limit).execution_options(populate_existing=True)
    if offset:
        stmt = stmt.offset(offset)
    return list((await db.scalars(stmt)).all())


async def _count(db: AsyncSession, conds: list[Any]) -> int:
    return await db.scalar(select(func.count()).select_from(Order).where(*conds)) or 0


async def list_orders(db: AsyncSession, q: AdminOrderListQuery) -> dict[str, Any]:
    conds = _where(q)
    orders = await _fetch(db, conds, Order.created_at.desc(), (q.page - 1) * q.limit, q.limit)
    total = await _count(db, conds)
    return {"items": await _cards(db, orders), "total": total, "page": q.page, "limit": q.limit}


async def kanban(db: AsyncSession, q: AdminOrderListQuery) -> list[dict[str, Any]]:
    """Kanban: har ustunda eng uzoq kutayotganlar birinchi"""
    base = _where(q)
    out = []
    for status in KANBAN_STATUSES:
        conds = [*base, Order.status == status]
        orders = await _fetch(db, conds, Order.updated_at.asc(), None, KANBAN_LIMIT)
        out.append({"status": status, "total": await _count(db, conds), "items": await _cards(db, orders)})
    return out
