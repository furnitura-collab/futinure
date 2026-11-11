"""Admin buyurtmalari: batafsil ko'rinish va menejer biriktirish."""

from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.domain.dates import business_date
from app.domain.state_machine import TERMINAL_STATUSES, available_transitions
from app.models import (
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
from app.services.audit import audit

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
