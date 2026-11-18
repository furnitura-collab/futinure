"""Admin buyurtmalari: batafsil ko'rinish va menejer biriktirish."""

from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.auth.permissions import can, visible_order_statuses
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
    OrderStatusHistory,
    Payment,
    PriceGroup,
    ProductVariant,
    User,
    Warehouse,
)
from app.modules.orders import inventory
from app.services.audit import audit

# ───────────── Batafsil ─────────────


def _user_pick(u: Any, *fields: str) -> dict[str, Any] | None:
    if u is None:
        return None
    return {f: getattr(u, {"id": "id", "fullName": "full_name", "phone": "phone", "role": "role"}[f]) for f in fields}


def _profile_json(profile: Any, price_group: Any, finance: bool) -> dict[str, Any]:
    out = row(profile, priceGroup=price_group)
    if not finance:
        out.update(balanceCached=None)
    return out


async def detail(db: AsyncSession, order_id: str, viewer: Any, *, scoped: bool = False) -> dict[str, Any]:
    """
    viewer — `.role` atributi bor obyekt. scoped — ko'rish so'rovi: rol ko'rmaydigan status 404
    (amal javobida emas: omborchi topshirgan buyurtma yakunlanib, uning doirasidan chiqadi).
    Moliya (to'lovlar, mijoz balansi) — faqat `orders.finance` ruxsati bilan.
    """
    await db.flush()
    order = (await db.scalars(select(Order).where(Order.id == order_id).execution_options(populate_existing=True))).first()
    statuses = visible_order_statuses(viewer.role)
    if not order or (scoped and statuses is not None and order.status not in statuses):
        raise AppError.not_found("Buyurtma")
    finance = can(viewer.role, "orders.finance")

    def fresh(stmt: Any) -> Any:
        return stmt.execution_options(populate_existing=True)

    items = (
        await db.scalars(
            fresh(select(OrderItem).where(OrderItem.order_id == order_id).order_by(OrderItem.created_at, OrderItem.id))
        )
    ).all()
    # Profil, narx guruhi va buyurtmalar soni — bitta so'rovda (baza uzoqda)
    orders_count = select(func.count()).select_from(Order).where(Order.customer_id == order.customer_id).scalar_subquery()
    profile, pg_id, pg_name, count = (
        await db.execute(
            fresh(
                select(CustomerProfile, PriceGroup.id, PriceGroup.name, orders_count)
                .select_from(User)
                .outerjoin(CustomerProfile, CustomerProfile.user_id == User.id)
                .outerjoin(PriceGroup, PriceGroup.id == CustomerProfile.price_group_id)
                .where(User.id == order.customer_id)
            )
        )
    ).one()
    price_group = {"id": pg_id, "name": pg_name} if pg_id else None
    warehouse = (
        (await db.scalars(fresh(select(Warehouse).where(Warehouse.id == order.pickup_warehouse_id)))).first()
        if order.pickup_warehouse_id
        else None
    )
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

    # Mijoz, menejer, haydovchi va tarixdagi aktyorlar — bitta so'rovda
    driver_id = delivery.driver_id if delivery else None
    user_ids = {order.customer_id, order.manager_id, driver_id, *(h.actor_id for h in history)} - {None}
    users = {
        u.id: u
        for u in (await db.execute(select(User.id, User.full_name, User.phone, User.role).where(User.id.in_(user_ids)))).all()
    }
    customer = users[order.customer_id]
    manager = users.get(order.manager_id) if order.manager_id else None
    driver = users.get(driver_id) if driver_id else None
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

    def actor_json(actor_id: str | None) -> dict[str, Any] | None:
        a = users.get(actor_id) if actor_id else None
        return {"id": a.id, "fullName": a.full_name, "role": a.role} if a else None

    return {
        **row(order),
        "items": [item_json(i) for i in items],
        "customer": {
            "id": customer.id,
            "phone": customer.phone,
            "fullName": customer.full_name,
            "customerProfile": _profile_json(profile, price_group, finance) if profile else None,
            "_count": {"orders": count or 0},
        },
        "manager": _user_pick(manager, "id", "fullName", "phone"),
        "pickupWarehouse": row(warehouse) if warehouse else None,
        "statusHistory": [row(h, actor=actor_json(h.actor_id)) for h in history],
        "payments": [row(p) for p in payments] if finance else [],
        "delivery": row(delivery, driver=_user_pick(driver, "id", "fullName", "phone")) if delivery else None,
        "balanceDue": order.grand_total - order.paid_total,
        "availableTransitions": [
            {"to": t.to, "requiresComment": t.requires_comment}
            for t in available_transitions(order.status, viewer.role, order.delivery_type)
            # Jo'natish — haydovchi biriktirilgandan keyin (tugma oldin ko'rinmaydi)
            if t.to != "OUT_FOR_DELIVERY" or driver_id
        ],
        # Shartlar (to'lov turi, yetkazish narxi) faqat qabul qilinmagan buyurtmada o'zgaradi
        "canSetTerms": order.status == "NEW" and can(viewer.role, "orders.manage"),
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
