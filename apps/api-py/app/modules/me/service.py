"""Joriy foydalanuvchi ma'lumoti — /me va kirish javobi bir xil shaklda"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.auth.permissions import granted, refresh
from app.core.errors import AppError
from app.models import CustomerProfile, User


async def get_me(db: AsyncSession, user_id: str) -> dict:
    user = await db.scalar(
        select(User).options(joinedload(User.customer_profile).joinedload(CustomerProfile.price_group)).where(User.id == user_id)
    )
    if not user:
        raise AppError.not_found("Foydalanuvchi")
    await refresh()
    p = user.customer_profile
    return {
        "id": user.id,
        "phone": user.phone,
        "fullName": user.full_name,
        "role": user.role,
        # Admin panel menyu va tugmalarni shundan chizadi (super admin rollarga belgilagan ruxsatlar)
        "permissions": granted(user.role),
        "locale": user.locale,
        "customerProfile": p
        and {
            "type": p.type,
            "companyName": p.company_name,
            "inn": p.inn,
            "allowedPaymentMethods": p.allowed_payment_methods,
            "balanceCached": p.balance_cached,
            "priceGroup": p.price_group and {"id": p.price_group.id, "name": p.price_group.name},
        },
    }
