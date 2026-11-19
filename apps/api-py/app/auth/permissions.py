"""
Rollar ruxsatlari (docs/15-roles-permissions-prompt.md). Standart jadval — packages/shared/src/permissions.ts nusxasi
(tests/test_unit.py solishtiradi); super admin uni admin panelda o'zgartiradi (settings.role_permissions).
Holat o'tishlari alohida — app/domain/state_machine.py.

    from app.auth.permissions import Can, can

    @router.get("/admin/orders")
    async def admin_list(u: Can("orders.view"), ...): ...   # so'rovda — joriy jadval bo'yicha
    if can(actor.role, "orders.manage"): ...                 # servis ichida — xotiradagi jadval
"""

import time
from collections.abc import Mapping
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import select

from app.auth.deps import AuthUser, current_user
from app.core.errors import AppError

MANAGERS = ("MANAGER", "SUPER_ADMIN")

PERMISSIONS: dict[str, tuple[str, ...]] = {
    "orders.view": ("WAREHOUSE", *MANAGERS),
    "orders.manage": MANAGERS,
    "orders.finance": MANAGERS,
    "orders.chat": MANAGERS,
    "orders.override": ("SUPER_ADMIN",),
    "payments.manage": MANAGERS,
    "payments.adjust": ("SUPER_ADMIN",),
    "catalog.view": ("WAREHOUSE", *MANAGERS),
    "catalog.edit": MANAGERS,
    "catalog.delete": ("SUPER_ADMIN",),
    "prices.manage": ("SUPER_ADMIN",),
    "stock.manage": ("WAREHOUSE", *MANAGERS),
    "customers.manage": MANAGERS,
    "staff.manage": ("SUPER_ADMIN",),
}

# Super admin o'zgartira oladigan rollar (super admin — doim hammasi; mijoz/haydovchi admin panelga kirmaydi)
EDITABLE_ROLES = ("MANAGER", "WAREHOUSE")
# Boshqa rolga berilmaydi: xodimlarni boshqargan menejer o'zini super admin qilib qo'yishi mumkin
SUPER_ADMIN_ONLY = frozenset({"staff.manage"})
SETTING_KEY = "role_permissions"
# Bir nechta server nusxasi bo'lsa — boshqasidagi o'zgarish shu vaqt ichida yetib keladi
TTL_SECONDS = 30.0

# Omborchi ko'radigan buyurtmalar — qabul qilingan va hali yetkazilmagan
WAREHOUSE_ORDER_STATUSES = ("PREPARING", "READY", "OUT_FOR_DELIVERY")


def defaults() -> dict[str, list[str]]:
    """Standart jadval: tahrirlanadigan rol → ruxsatlar"""
    return {r: sorted(p for p, roles in PERMISSIONS.items() if r in roles) for r in EDITABLE_ROLES}


def normalize(matrix: Mapping[str, Any] | None) -> dict[str, list[str]]:
    """Saqlangan/yuborilgan jadval → toza ko'rinish: noma'lum ruxsat va qulflanganlar tashlanadi, yo'q rol — standart"""
    base = defaults()
    for role in EDITABLE_ROLES:
        given = (matrix or {}).get(role)
        if isinstance(given, list):
            base[role] = sorted({p for p in given if p in PERMISSIONS and p not in SUPER_ADMIN_ONLY})
    return base


class _State:
    granted: dict[str, frozenset[str]] = {}
    loaded_at = 0.0


def apply(matrix: Mapping[str, Any] | None) -> None:
    """Xotiradagi jadvalni yangilaydi (saqlangach — darhol)"""
    _State.granted = {"SUPER_ADMIN": frozenset(PERMISSIONS), **{r: frozenset(p) for r, p in normalize(matrix).items()}}
    _State.loaded_at = time.monotonic()


def reset() -> None:
    """Standartga va keyingi so'rovda bazadan qayta o'qishga (testlar)"""
    apply(None)
    _State.loaded_at = 0.0


async def refresh(force: bool = False) -> None:
    if not force and time.monotonic() - _State.loaded_at < TTL_SECONDS:
        return
    from app.db import standalone_session
    from app.models import Setting

    async with standalone_session() as db:
        apply(await db.scalar(select(Setting.value).where(Setting.key == SETTING_KEY)))


def can(role: str | None, permission: str) -> bool:
    return permission in _State.granted.get(role or "", ())


def granted(role: str) -> list[str]:
    return sorted(_State.granted.get(role, ()))


def visible_order_statuses(role: str) -> tuple[str, ...] | None:
    """Xodim ko'radigan buyurtma statuslari; None — hammasi"""
    return WAREHOUSE_ORDER_STATUSES if role == "WAREHOUSE" else None


def Can(permission: str, *also: str) -> Any:  # noqa: N802 — tip kabi ishlatiladi: `u: Can("orders.view")`
    """Ruxsat egasi (+ `also` rollar, masalan mijoz o'z chekini ko'radi) — aks holda 403. Jadval so'rov paytidagi"""
    assert permission in PERMISSIONS, permission

    async def dep(user: Annotated[AuthUser, Depends(current_user)]) -> AuthUser:
        if user.role not in also:
            await refresh()
            if not can(user.role, permission):
                raise AppError.forbidden()
        return user

    # tests/support_routes.py endpoint jadvalini shu belgilardan o'qiydi
    dep.permission = permission  # type: ignore[attr-defined]
    dep.also = also  # type: ignore[attr-defined]
    return Annotated[AuthUser, Depends(dep)]


apply(None)
