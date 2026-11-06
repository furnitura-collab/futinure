"""
Production: ADMIN_PHONE raqamli super admin (bo'lmasa yaratadi).
ADMIN_PASSWORD berilsa — paroli hali yo'q bo'lsagina o'rnatiladi: har restartda
admin o'zi almashtirgan parol qayta yozilib ketmasin.
Demo ma'lumotlarsiz toza bazaga birinchi kirish uchun.

    uv run python -m app.scripts.create_admin
"""

import asyncio
import os
import sys

from sqlalchemy import select

from app.auth.password import hash_password
from app.db import dispose, standalone_session
from app.domain.phone import normalize_uz_phone
from app.models import User

PASSWORD_MIN = 6


async def main() -> None:
    phone = normalize_uz_phone(os.environ.get("ADMIN_PHONE", ""))
    if not phone:
        sys.exit(f"ADMIN_PHONE noto'g'ri: \"{os.environ.get('ADMIN_PHONE', '')}\"")
    password = os.environ.get("ADMIN_PASSWORD") or None
    if password and len(password) < PASSWORD_MIN:
        sys.exit(f"ADMIN_PASSWORD kamida {PASSWORD_MIN} belgi bo'lishi kerak")

    password_hash = await hash_password(password) if password else None
    async with standalone_session() as db:
        admin = await db.scalar(select(User).where(User.phone == phone))
        if admin is None:
            admin = User(phone=phone, full_name=os.environ.get("ADMIN_NAME") or "Super Admin", role="SUPER_ADMIN")
            admin.password_hash = password_hash
            db.add(admin)
        elif password_hash and not admin.password_hash:
            admin.password_hash = password_hash
        has_password = bool(admin.password_hash)
        await db.commit()
    await dispose()
    print(f"Super admin: {phone}{'' if has_password else " (parol yo'q — ADMIN_PASSWORD bering)"}")


if __name__ == "__main__":
    asyncio.run(main())
