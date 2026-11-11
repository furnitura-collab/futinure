"""
Admin: mijozlar ro'yxati, kartochka, tahrirlash, qo'lda tuzatish, pul qaytarish, debitorlik.
HTTP yo'llari payments modulida: /admin/customers/*,
/admin/reports/receivables.
"""

import re
from typing import Any

from sqlalchemy import exists, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import tokens
from app.auth.deps import AuthUser
from app.core.errors import AppError
from app.core.serialize import row
from app.db import transaction
from app.domain.dates import business_date, to_date
from app.models import CustomerProfile, Order, PriceGroup, User, utcnow
from app.modules.customers import finance
from app.modules.customers.admin_ledger import adjust, receivables, refund
from app.modules.customers.credit_orders import UNPAID_CREDIT_ORDER_SQL
from app.modules.customers.schemas import AdminCustomerListQuery, AdminCustomerUpdate
from app.services.audit import audit

__all__ = ["SUPER_ADMIN_FIELDS", "list_customers", "detail", "update", "adjust", "refund", "receivables"]


# Faqat super admin o'zgartira oladigan maydonlar
SUPER_ADMIN_FIELDS = (("credit_limit", "creditLimit"), ("payment_term_days", "paymentTermDays"))


def _profile_json(p: CustomerProfile | None) -> dict[str, Any] | None:
    """customerProfile: { include: { priceGroup: { select: { id, name } } } }"""
    if p is None:
        return None
    return row(p, priceGroup=p.price_group and {"id": p.price_group.id, "name": p.price_group.name})


def _profile_has(*conds: Any) -> Any:
    """Prisma: { customerProfile: { ... } } — profil bo'yicha filtr"""
    return exists().where(CustomerProfile.user_id == User.id, *conds).correlate(User)


_PROFILE = selectinload(User.customer_profile).selectinload(CustomerProfile.price_group)


async def list_customers(db: AsyncSession, q: AdminCustomerListQuery) -> dict[str, Any]:
    """Mijozlar (sahifalangan). Javob: { items, total, page, limit }; qarzdorlar — eng katta qarz birinchi"""
    conds: list[Any] = [User.role == "CUSTOMER"]
    if q.q:
        digits = re.sub(r"\D", "", q.q)
        like = f"%{q.q}%"
        ors: list[Any] = [
            User.full_name.ilike(like),
            _profile_has(CustomerProfile.company_name.ilike(like)),
            _profile_has(CustomerProfile.inn.like(like)),
        ]
        if len(digits) >= 4:
            ors.append(User.phone.like(f"%{digits}%"))
        conds.append(or_(*ors))
    if q.price_group_id:
        conds.append(_profile_has(CustomerProfile.price_group_id == q.price_group_id))
    if q.debtors:
        conds.append(_profile_has(CustomerProfile.balance_cached > 0))
    if q.overdue:
        ids = (
            await db.execute(
                text(
                    f"SELECT DISTINCT customer_id FROM orders WHERE {UNPAID_CREDIT_ORDER_SQL} AND due_date < CAST(:today AS date)"
                ),
                {"today": to_date(business_date())},
            )
        ).scalars()
        conds.append(User.id.in_([str(i) for i in ids]))

    orders_count = select(func.count()).select_from(Order).where(Order.customer_id == User.id).scalar_subquery()
    stmt = select(User, orders_count).options(_PROFILE).where(*conds)
    if q.debtors:
        stmt = stmt.outerjoin(CustomerProfile, CustomerProfile.user_id == User.id).order_by(CustomerProfile.balance_cached.desc())
    else:
        stmt = stmt.order_by(User.created_at.desc())
    rows = (await db.execute(stmt.offset((q.page - 1) * q.limit).limit(q.limit))).all()
    items = [
        {
            "id": u.id,
            "phone": u.phone,
            "fullName": u.full_name,
            "isActive": u.is_active,
            "createdAt": u.created_at,
            "lastLoginAt": u.last_login_at,
            "customerProfile": _profile_json(u.customer_profile),
            "_count": {"orders": n},
        }
        for u, n in rows
    ]
    total = await db.scalar(select(func.count()).select_from(User).where(*conds)) or 0
    return {"items": items, "total": total, "page": q.page, "limit": q.limit}


async def detail(db: AsyncSession, customer_id: str) -> dict[str, Any]:
    """Mijoz kartochkasi: profil, manzillar, moliya, statistika, oxirgi 10 buyurtma. 404 — mijoz emas/yo'q"""
    user = await db.scalar(
        select(User)
        .options(_PROFILE, selectinload(User.addresses))
        .where(User.id == customer_id, User.role == "CUSTOMER")
        .execution_options(populate_existing=True)
    )
    if not user:
        raise AppError.not_found("Mijoz")
    fin = await finance.balance(db, customer_id)
    count, turnover = (
        await db.execute(
            select(func.count(), func.sum(Order.grand_total)).where(Order.customer_id == customer_id, Order.status != "CANCELLED")
        )
    ).one()
    recent = await db.scalars(select(Order).where(Order.customer_id == customer_id).order_by(Order.created_at.desc()).limit(10))
    return {
        "id": user.id,
        "phone": user.phone,
        "fullName": user.full_name,
        "isActive": user.is_active,
        "locale": user.locale,
        "createdAt": user.created_at,
        "lastLoginAt": user.last_login_at,
        "customerProfile": _profile_json(user.customer_profile),
        "addresses": [row(a) for a in user.addresses],
        "finance": fin,
        "stats": {"orders": count, "turnover": int(turnover or 0)},
        "recentOrders": [
            {
                "id": o.id,
                "number": o.number,
                "status": o.status,
                "grandTotal": o.grand_total,
                "paidTotal": o.paid_total,
                "createdAt": o.created_at,
                "dueDate": o.due_date,
            }
            for o in recent
        ],
    }


async def update(db: AsyncSession, customer_id: str, body: AdminCustomerUpdate, actor: AuthUser) -> dict[str, Any]:
    """
    Mijozni tahrirlash. creditLimit/paymentTermDays — faqat SUPER_ADMIN (aks holda 403).
    isActive=false — barcha sessiyalar yopiladi. Javob: detail().
    """
    fields = body.model_fields_set
    if actor.role != "SUPER_ADMIN":
        forbidden = [camel for f, camel in SUPER_ADMIN_FIELDS if f in fields and getattr(body, f) is not None]
        if forbidden:
            raise AppError.forbidden(f"Faqat super admin: {', '.join(forbidden)}")
    user = await db.scalar(
        select(User).options(selectinload(User.customer_profile)).where(User.id == customer_id, User.role == "CUSTOMER")
    )
    if not user:
        raise AppError.not_found("Mijoz")
    if body.price_group_id:
        if not await db.scalar(select(func.count()).select_from(PriceGroup).where(PriceGroup.id == body.price_group_id)):
            raise AppError.not_found("Narx guruhi")

    profile = user.customer_profile
    before = row(user, customerProfile=profile and row(profile))
    async with transaction(db):
        if "full_name" in fields and body.full_name is not None:
            user.full_name = body.full_name
        if "is_active" in fields and body.is_active is not None:
            user.is_active = body.is_active
        user.updated_at = utcnow()
        if profile is None:
            raise AppError("NOT_FOUND", "Yozuv topilmadi", 404)
        for f in (
            "type",
            "company_name",
            "inn",
            "price_group_id",
            "credit_limit",
            "payment_term_days",
            "allowed_payment_methods",
        ):
            if f in fields:
                setattr(profile, f, getattr(body, f))
        profile.updated_at = utcnow()
        await db.flush()
        await audit(
            db,
            actor_id=actor.id,
            entity="customer",
            entity_id=customer_id,
            action="update",
            before=before,
            after=body.model_dump(by_alias=True, exclude_unset=True),
        )
    # Bloklangan mijoz darhol chiqariladi (access token 15 daqiqada tugaydi)
    if "is_active" in fields and body.is_active is False:
        await tokens.revoke_all_for_user(db, customer_id)
    return await detail(db, customer_id)
