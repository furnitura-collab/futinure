"""Joriy foydalanuvchi ma'lumoti — /me va kirish javobi bir xil shaklda"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.errors import AppError
from app.models import CustomerProfile, User


async def get_me(db: AsyncSession, user_id: str) -> dict:
    user = await db.scalar(
        select(User).options(joinedload(User.customer_profile).joinedload(CustomerProfile.price_group)).where(User.id == user_id)
    )
    if not user:
        raise AppError.not_found("Foydalanuvchi")
    p = user.customer_profile
    return {
        "id": user.id,
        "phone": user.phone,
        "fullName": user.full_name,
        "role": user.role,
        "locale": user.locale,
        "customerProfile": p
        and {
            "type": p.type,
            "companyName": p.company_name,
            "inn": p.inn,
            "creditLimit": p.credit_limit,
            "paymentTermDays": p.payment_term_days,
            "allowedPaymentMethods": p.allowed_payment_methods,
            "balanceCached": p.balance_cached,
            "priceGroup": p.price_group and {"id": p.price_group.id, "name": p.price_group.name},
        },
    }
