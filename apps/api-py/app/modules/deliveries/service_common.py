"""Yetkazish: konstantalar va javob ko'rinishi."""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.serialize import pick
from app.models import Delivery, Order, OrderItem, Payment, User

DELIVERY_PROOF_PURPOSE = "DELIVERY_PROOF"

# Qabul qilingan buyurtmaga haydovchi biriktiriladi/almashtiriladi (yo'lga chiqqandan keyin — yo'q)
ASSIGNABLE = ("PREPARING", "READY")
# Haydovchi ro'yxatidagi "faol" yetkazishlar
ACTIVE = ("PREPARING", "READY", "OUT_FOR_DELIVERY")

# deliverySelect — Prisma select tartibida
_DELIVERY_FIELDS = (
    "id",
    "order_id",
    "status",
    "scheduled_date",
    "slot",
    "vehicle_type",
    "receiver_name",
    "delivered_at",
    "fail_reason",
    "cash_collected",
    "proof_upload_id",
)
# orderSelect (grandTotal/paidTotal/payments/_count present() ichida olib tashlanadi)
_ORDER_FIELDS = (
    "id",
    "number",
    "status",
    "version",
    "customer_id",
    "address_snapshot",
    "delivery_date",
    "delivery_slot",
    "total_weight_kg",
    "payment_terms",
    "customer_comment",
)
_ITEM_FIELDS = ("id", "sku", "name_uz", "name_ru", "unit", "qty", "attributes")

_LOAD = selectinload(Delivery.order).selectinload(Order.customer).selectinload(User.customer_profile)


async def _present(db: AsyncSession, rows: list[Delivery]) -> list[dict[str, Any]]:
    """Haydovchiga ko'rinadigan shakl: narxlar yo'q, faqat olinadigan summa"""
    ids = [d.order_id for d in rows]
    if not ids:
        return []
    pending = dict(
        (
            await db.execute(
                select(Payment.order_id, func.sum(Payment.amount))
                .where(Payment.order_id.in_(ids), Payment.status == "PENDING")
                .group_by(Payment.order_id)
            )
        ).all()
    )
    counts = dict(
        (
            await db.execute(
                select(OrderItem.order_id, func.count())
                .where(OrderItem.order_id.in_(ids), OrderItem.status == "ACTIVE")
                .group_by(OrderItem.order_id)
            )
        ).all()
    )
    out = []
    for d in rows:
        o = d.order
        due = o.grand_total - o.paid_total - int(pending.get(o.id) or 0)
        profile = o.customer.customer_profile
        out.append(
            pick(
                d,
                *_DELIVERY_FIELDS,
                order=pick(
                    o,
                    *_ORDER_FIELDS,
                    customer={
                        "fullName": o.customer.full_name,
                        "phone": o.customer.phone,
                        "customerProfile": profile and {"companyName": profile.company_name},
                    },
                    itemsCount=counts.get(o.id, 0),
                    # Nasiyada pul olinmaydi; qolgan holatda — to'lanmagan qoldiq
                    toCollect=0 if o.payment_terms == "CREDIT" or due < 0 else due,
                ),
            )
        )
    return out
