"""Mijoz buyurtmalari"""

import logging
from collections import defaultdict
from decimal import Decimal
from typing import Any

from sqlalchemy import exists, func, null, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import pick, row
from app.db import transaction
from app.domain.customer_order import amount_due_now
from app.domain.dates import business_date, to_date
from app.domain.state_machine import CUSTOMER_CANCELLABLE, TERMINAL_STATUSES
from app.models import (
    Address,
    CartItem,
    ChatMessage,
    Order,
    OrderItem,
    OrderQuote,
    OrderStatusHistory,
    Payment,
    User,
    Warehouse,
)
from app.modules.cart.service import blocking_issues, view
from app.modules.orders import workflow
from app.modules.orders.lock import lock_order
from app.modules.orders.quotes import present_quote
from app.modules.orders.schemas import MAX_DELIVERY_DAYS_AHEAD, CreateOrderInput, OrderListQuery
from app.modules.orders.terms import valid_delivery_date
from app.services.audit import audit
from app.services.outbox import add_event

log = logging.getLogger("OrdersService")

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


async def detail(db: AsyncSession, customer_id: str, order_id: str) -> dict[str, Any]:
    order = (
        await db.scalars(
            select(Order).where(Order.id == order_id, Order.customer_id == customer_id).execution_options(populate_existing=True)
        )
    ).first()
    if not order:
        raise AppError.not_found("Buyurtma")
    items = (
        await db.scalars(
            select(OrderItem)
            .where(OrderItem.order_id == order_id, OrderItem.status == "ACTIVE")
            .order_by(OrderItem.created_at, OrderItem.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    history = (
        await db.execute(
            select(
                OrderStatusHistory.from_status,
                OrderStatusHistory.to_status,
                OrderStatusHistory.comment,
                OrderStatusHistory.created_at,
            )
            .where(OrderStatusHistory.order_id == order_id)
            .order_by(OrderStatusHistory.created_at, OrderStatusHistory.id)
        )
    ).all()
    warehouse = None
    if order.pickup_warehouse_id:
        w = (
            await db.execute(
                select(Warehouse.id, Warehouse.name, Warehouse.address_text, Warehouse.phone, Warehouse.work_hours).where(
                    Warehouse.id == order.pickup_warehouse_id
                )
            )
        ).one_or_none()
        if w:
            warehouse = {"id": w.id, "name": w.name, "addressText": w.address_text, "phone": w.phone, "workHours": w.work_hours}
    payments = (
        await db.execute(
            select(Payment.id, Payment.amount, Payment.method, Payment.status, Payment.created_at, Payment.reject_reason)
            .where(Payment.order_id == order_id)
            .order_by(Payment.created_at.desc())
        )
    ).all()
    quote = None
    if order.current_quote_id:
        quote = (
            await db.scalars(
                select(OrderQuote).where(OrderQuote.id == order.current_quote_id).execution_options(populate_existing=True)
            )
        ).first()

    # Ichki maydonlar mijozga ko'rsatilmaydi
    return {
        **row(order, exclude=("idempotency_key", "cancelled_by")),
        "items": [row(i) for i in items],
        "statusHistory": [
            {"fromStatus": h.from_status, "toStatus": h.to_status, "comment": h.comment, "createdAt": h.created_at}
            for h in history
        ],
        "pickupWarehouse": warehouse,
        "payments": [
            {
                "id": p.id,
                "amount": p.amount,
                "method": p.method,
                "status": p.status,
                "createdAt": p.created_at,
                "rejectReason": p.reject_reason,
            }
            for p in payments
        ],
        # Faqat javob kutayotgan taklif ko'rsatiladi
        "pendingQuote": present_quote(quote) if quote and quote.status == "PENDING" and order.status == "QUOTED" else None,
        "balanceDue": order.grand_total - order.paid_total,
        "amountDue": amount_due(order, list(payments)),
        "canCancel": order.status in CUSTOMER_CANCELLABLE,
    }


async def cancel(db: AsyncSession, customer: AuthUser, order_id: str, reason: str) -> dict[str, Any]:
    async with transaction(db):
        order = await lock_order(db, order_id)
        if order.customer_id != customer.id:
            raise AppError.not_found("Buyurtma")
        await workflow.cancel(db, order, reason, customer)
    return await detail(db, customer.id, order_id)


async def quote_history(db: AsyncSession, customer_id: str, order_id: str) -> list[dict[str, Any]]:
    found = await db.scalar(select(exists().where(Order.id == order_id, Order.customer_id == customer_id)))
    if not found:
        raise AppError.not_found("Buyurtma")
    quotes = (
        await db.scalars(
            select(OrderQuote)
            .where(OrderQuote.order_id == order_id)
            .order_by(OrderQuote.version.desc())
            .execution_options(populate_existing=True)
        )
    ).all()
    return [present_quote(q) for q in quotes]
