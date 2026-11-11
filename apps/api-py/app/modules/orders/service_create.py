"""Mijoz buyurtmalari: yaratish (idempotent)."""

import logging
from decimal import Decimal
from typing import Any

from sqlalchemy import null, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.domain.dates import business_date, to_date
from app.models import Address, CartItem, Order, OrderItem, OrderStatusHistory, User, Warehouse
from app.modules.cart.service import blocking_issues, view
from app.modules.orders.schemas import MAX_DELIVERY_DAYS_AHEAD, CreateOrderInput
from app.modules.orders.service_detail import detail
from app.modules.orders.terms import valid_delivery_date
from app.services.audit import audit
from app.services.outbox import add_event

log = logging.getLogger("OrdersService")


# ───────────── Yaratish ─────────────


async def create(db: AsyncSession, customer: AuthUser, body: CreateOrderInput, key: str) -> tuple[dict[str, Any], bool]:
    """
    Savatdan buyurtma. Idempotent: bir xil kalit bilan qayta so'rov — o'sha buyurtma qaytadi.
    Qaytaradi: (buyurtma, replayed) — replayed=True bo'lsa yangi buyurtma yaratilmadi.
    """
    existing = await _find_by_key(db, customer.id, key)
    if existing:
        return existing, True
    try:
        async with transaction(db):
            order_id, replayed = await _create_in_tx(db, customer, body, key)
    except IntegrityError:
        # Ikki parallel so'rov bir xil kalit bilan: ikkinchisi unique cheklovga uriladi
        order = await _find_by_key(db, customer.id, key)
        if order:
            return order, True
        raise
    if not replayed:
        log.info("Yangi buyurtma %s", order_id)
    return await detail(db, customer.id, order_id), replayed


async def _create_in_tx(db: AsyncSession, customer: AuthUser, body: CreateOrderInput, key: str) -> tuple[str, bool]:
    # Bir xil kalitli parallel so'rovlar navbatga turadi; navbat kelganda buyurtma allaqachon bo'lsa — o'shani qaytaramiz
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"), {"k": f"{customer.id}:{key}"})
    existing = await db.scalar(select(Order.id).where(Order.customer_id == customer.id, Order.idempotency_key == key))
    if existing:
        return existing, True

    full_name = (await db.execute(select(User.full_name).where(User.id == customer.id))).scalar_one()
    if not full_name:
        raise AppError("PROFILE_INCOMPLETE", "Buyurtmadan oldin ismingizni kiriting", 422)

    # Savat qatorlarini qulflaymiz: boshqa kalit bilan parallel buyurtma shu savatni ikkinchi marta ololmaydi
    await db.execute(text("SELECT 1 FROM cart_items WHERE user_id = CAST(:id AS uuid) FOR UPDATE"), {"id": customer.id})
    cart = await view(db, customer.id)
    if cart.count == 0:
        raise AppError("CART_EMPTY", "Savat bo'sh", 409)
    if cart.has_blocking_issues:
        raise AppError(
            "CART_HAS_ISSUES",
            "Savatdagi ba'zi tovarlarni tuzating",
            409,
            {
                "lines": [
                    {"variantId": ln.variant_id, "sku": ln.sku, "issues": ln.issues} for ln in cart.lines if blocking_issues(ln)
                ]
            },
        )

    delivery = await _resolve_delivery(db, customer.id, body)
    nextval = (await db.execute(text("SELECT nextval('order_number_seq')"))).scalar_one()
    number = f"MO-{business_date()[:4]}-{nextval:06d}"

    order = Order(
        number=number,
        customer_id=customer.id,
        status="NEW",
        delivery_type=body.delivery_type,
        **delivery,
        customer_comment=body.comment,
        idempotency_key=key,
        items_total=cart.items_total,
        grand_total=cart.items_total,
        total_weight_kg=Decimal(repr(cart.total_weight_kg)),
        total_volume_m3=Decimal(repr(cart.total_volume_m3)),
    )
    db.add(order)
    await db.flush()
    for ln in cart.lines:
        db.add(
            OrderItem(
                order_id=order.id,
                variant_id=ln.variant_id,
                sku=ln.sku,
                name_uz=ln.name_uz,
                name_ru=ln.name_ru,
                unit=ln.unit,
                attributes=ln.attributes if ln.attributes is not None else {},
                requested_qty=Decimal(ln.qty),
                qty=Decimal(ln.qty),
                unit_price=ln.unit_price,
                line_total=ln.line_total,
            )
        )
        await db.flush()
    db.add(OrderStatusHistory(order_id=order.id, from_status=None, to_status="NEW", actor_id=customer.id))
    await db.flush()
    await db.execute(CartItem.__table__.delete().where(CartItem.user_id == customer.id))
    await audit(
        db,
        actor_id=customer.id,
        entity="order",
        entity_id=order.id,
        action="create",
        after={"number": number, "total": cart.items_total},
    )
    await add_event(db, "order.created", {"orderId": order.id})
    return order.id, False


async def _resolve_delivery(db: AsyncSession, customer_id: str, body: CreateOrderInput) -> dict[str, Any]:
    delivery_date = None
    if body.delivery_date:
        if not valid_delivery_date(body.delivery_date):
            raise AppError("INVALID_DELIVERY_DATE", f"Sana bugundan {MAX_DELIVERY_DAYS_AHEAD} kungacha bo'lishi kerak", 422)
        delivery_date = to_date(body.delivery_date)

    if body.delivery_type == "DELIVERY":
        address = await db.scalar(select(Address).where(Address.id == body.address_id, Address.user_id == customer_id))
        if not address:
            raise AppError.not_found("Manzil")
        snapshot = row(address, exclude=("id", "user_id", "created_at"))
        return {"address_snapshot": snapshot, "pickup_warehouse_id": None, "delivery_date": delivery_date}
    warehouse = await db.scalar(select(Warehouse.id).where(Warehouse.id == body.warehouse_id, Warehouse.is_active.is_(True)))
    if not warehouse:
        raise AppError.not_found("Ombor")
    return {"address_snapshot": null(), "pickup_warehouse_id": warehouse, "delivery_date": delivery_date}


async def _find_by_key(db: AsyncSession, customer_id: str, key: str) -> dict[str, Any] | None:
    order_id = await db.scalar(select(Order.id).where(Order.customer_id == customer_id, Order.idempotency_key == key))
    return await detail(db, customer_id, order_id) if order_id else None
