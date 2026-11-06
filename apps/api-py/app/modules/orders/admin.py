"""
Admin buyurtmalari.

    from app.modules.orders import admin
    await admin.detail(db, order_id, viewer)      # viewer: .role bor obyekt (AuthUser)
    await admin.list_orders(db, q) / admin.kanban(db, q) / admin.assign(...) / admin.managers(db)
"""

import re
from decimal import Decimal
from typing import Any

from sqlalchemy import exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.domain.dates import business_date, day_range
from app.domain.state_machine import TERMINAL_STATUSES, available_transitions
from app.models import (
    ChatMessage,
    CustomerProfile,
    Delivery,
    Order,
    OrderItem,
    OrderQuote,
    OrderStatusHistory,
    Payment,
    PriceGroup,
    ProductVariant,
    User,
    Warehouse,
)
from app.modules.orders import inventory
from app.modules.orders.quotes import present_quote
from app.modules.orders.schemas import AdminOrderListQuery
from app.services.audit import audit

KANBAN_STATUSES = ("NEW", "QUOTED", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED")
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
    quotes = {
        q.id: q
        for q in (
            await db.execute(
                select(OrderQuote.id, OrderQuote.status, OrderQuote.expires_at).where(
                    OrderQuote.id.in_([o.current_quote_id for o in orders if o.current_quote_id])
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
        q = quotes.get(o.current_quote_id) if o.current_quote_id else None
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
                "currentQuote": {"status": q.status, "expiresAt": q.expires_at} if q else None,
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


# ───────────── Batafsil ─────────────


def _user_pick(u: User | None, *fields: str) -> dict[str, Any] | None:
    if u is None:
        return None
    return {f: getattr(u, {"id": "id", "fullName": "full_name", "phone": "phone", "role": "role"}[f]) for f in fields}


async def detail(db: AsyncSession, order_id: str, viewer: Any) -> dict[str, Any]:
    """viewer — `.role` atributi bor obyekt"""
    await db.flush()
    order = (await db.scalars(select(Order).where(Order.id == order_id).execution_options(populate_existing=True))).first()
    if not order:
        raise AppError.not_found("Buyurtma")

    def fresh(stmt: Any) -> Any:
        return stmt.execution_options(populate_existing=True)

    items = (
        await db.scalars(
            fresh(select(OrderItem).where(OrderItem.order_id == order_id).order_by(OrderItem.created_at, OrderItem.id))
        )
    ).all()
    customer = (await db.scalars(fresh(select(User).where(User.id == order.customer_id)))).one()
    profile = (await db.scalars(fresh(select(CustomerProfile).where(CustomerProfile.user_id == order.customer_id)))).first()
    price_group = None
    if profile and profile.price_group_id:
        pg = (await db.execute(select(PriceGroup.id, PriceGroup.name).where(PriceGroup.id == profile.price_group_id))).first()
        price_group = {"id": pg.id, "name": pg.name} if pg else None
    orders_count = await db.scalar(select(func.count()).select_from(Order).where(Order.customer_id == order.customer_id)) or 0
    manager = (await db.scalars(fresh(select(User).where(User.id == order.manager_id)))).first() if order.manager_id else None
    warehouse = (
        (await db.scalars(fresh(select(Warehouse).where(Warehouse.id == order.pickup_warehouse_id)))).first()
        if order.pickup_warehouse_id
        else None
    )
    quotes = (
        await db.scalars(fresh(select(OrderQuote).where(OrderQuote.order_id == order_id).order_by(OrderQuote.version.desc())))
    ).all()
    history = (
        await db.scalars(
            fresh(
                select(OrderStatusHistory)
                .where(OrderStatusHistory.order_id == order_id)
                .order_by(OrderStatusHistory.created_at, OrderStatusHistory.id)
            )
        )
    ).all()
    payments = (
        await db.scalars(fresh(select(Payment).where(Payment.order_id == order_id).order_by(Payment.created_at.desc())))
    ).all()
    delivery = (await db.scalars(fresh(select(Delivery).where(Delivery.order_id == order_id)))).first()
    driver = None
    if delivery and delivery.driver_id:
        driver = (await db.scalars(fresh(select(User).where(User.id == delivery.driver_id)))).first()

    actor_ids = list({h.actor_id for h in history if h.actor_id})
    actors = {a.id: a for a in (await db.execute(select(User.id, User.full_name, User.role).where(User.id.in_(actor_ids)))).all()}
    variants = {
        v.id: v
        for v in (
            await db.execute(
                select(
                    ProductVariant.id,
                    ProductVariant.stock_qty,
                    ProductVariant.reserved_qty,
                    ProductVariant.availability,
                    ProductVariant.is_active,
                ).where(ProductVariant.id.in_([i.variant_id for i in items]))
            )
        ).all()
    }
    own_reserved = await inventory.net_reserved(db, order.id)

    terminal = order.status in TERMINAL_STATUSES

    def item_json(i: OrderItem) -> dict[str, Any]:
        v = variants.get(i.variant_id)
        own = own_reserved.get(i.variant_id, Decimal(0))
        # Shu buyurtma uchun ishlatilishi mumkin bo'lgan miqdor (o'z rezervi bilan)
        available = v.stock_qty - v.reserved_qty + own if v else Decimal(0)
        stock = None
        if v and i.status == "ACTIVE" and not terminal:
            stock = {
                "available": available,
                "reserved": own,
                "onOrder": v.availability == "ON_ORDER",
                "isActive": v.is_active,
                "shortage": available < i.qty and v.availability != "ON_ORDER",
            }
        return row(i, stock=stock)

    credit_check = None
    if profile:
        credit_check = {
            "creditLimit": profile.credit_limit,
            "balance": profile.balance_cached,
            "exposureAfter": profile.balance_cached + (0 if terminal or order.status == "DELIVERED" else order.grand_total),
            "exceeds": order.payment_terms == "CREDIT"
            and not terminal
            and profile.balance_cached + order.grand_total > profile.credit_limit,
        }

    def actor_json(actor_id: str | None) -> dict[str, Any] | None:
        a = actors.get(actor_id) if actor_id else None
        return {"id": a.id, "fullName": a.full_name, "role": a.role} if a else None

    return {
        **row(order),
        "items": [item_json(i) for i in items],
        "customer": {
            "id": customer.id,
            "phone": customer.phone,
            "fullName": customer.full_name,
            "customerProfile": row(profile, priceGroup=price_group) if profile else None,
            "_count": {"orders": orders_count},
        },
        "manager": _user_pick(manager, "id", "fullName", "phone"),
        "pickupWarehouse": row(warehouse) if warehouse else None,
        "quotes": [present_quote(q) for q in quotes],
        "statusHistory": [row(h, actor=actor_json(h.actor_id)) for h in history],
        "payments": [row(p) for p in payments],
        "delivery": row(delivery, driver=_user_pick(driver, "id", "fullName", "phone")) if delivery else None,
        "balanceDue": order.grand_total - order.paid_total,
        "creditCheck": credit_check,
        "availableTransitions": [
            {"to": t.to, "requiresComment": t.requires_comment}
            for t in available_transitions(order.status, viewer.role, order.delivery_type)
            if t.to != "QUOTED"
        ],
        "canQuote": order.status in ("NEW", "QUOTED"),
        "today": business_date(),
    }


# ───────────── Biriktirish ─────────────


async def assign(db: AsyncSession, order_id: str, manager_id: str | None, actor: AuthUser) -> dict[str, Any]:
    if manager_id:
        found = await db.scalar(
            select(User.id).where(User.id == manager_id, User.role.in_(("MANAGER", "SUPER_ADMIN")), User.is_active.is_(True))
        )
        if not found:
            raise AppError("NOT_A_MANAGER", "Bunday faol menejer yo'q", 422)
    current = (await db.execute(select(Order.manager_id).where(Order.id == order_id))).first()
    if not current:
        raise AppError.not_found("Buyurtma")
    before = {"managerId": current.manager_id}
    # Versiya oshirilmaydi: biriktirish tarkibni o'zgartirmaydi va mijozdagi taklifni eskirtirmasligi kerak
    async with transaction(db):
        await db.execute(
            update(Order).where(Order.id == order_id).values(manager_id=manager_id).execution_options(synchronize_session=False)
        )
        await audit(
            db,
            actor_id=actor.id,
            entity="order",
            entity_id=order_id,
            action="assign",
            before=before,
            after={"managerId": manager_id},
        )
    return await detail(db, order_id, actor)


async def managers(db: AsyncSession) -> list[dict[str, Any]]:
    rows = (
        await db.execute(
            select(User.id, User.full_name, User.phone, User.role)
            .where(User.role.in_(("MANAGER", "SUPER_ADMIN")), User.is_active.is_(True))
            .order_by(User.full_name.asc())
        )
    ).all()
    return [{"id": r.id, "fullName": r.full_name, "phone": r.phone, "role": r.role} for r in rows]
