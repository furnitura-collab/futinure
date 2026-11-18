"""
Rollar ruxsatlari — packages/shared/src/permissions.ts nusxasi (tests/test_unit.py solishtiradi).
docs/15-roles-permissions-prompt.md. Holat o'tishlari alohida — app/domain/state_machine.py.

    from app.auth.permissions import Can

    @router.get("/admin/orders")
    async def admin_list(u: Can("orders.view"), ...): ...
"""

from typing import Annotated, Any

from fastapi import Depends

from app.auth.deps import AuthUser, require_roles

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

# Omborchi ko'radigan buyurtmalar — qabul qilingan va hali yetkazilmagan
WAREHOUSE_ORDER_STATUSES = ("PREPARING", "READY", "OUT_FOR_DELIVERY")


def visible_order_statuses(role: str) -> tuple[str, ...] | None:
    """Xodim ko'radigan buyurtma statuslari; None — hammasi"""
    return WAREHOUSE_ORDER_STATUSES if role == "WAREHOUSE" else None


def can(role: str | None, permission: str) -> bool:
    return role in PERMISSIONS[permission]


def Can(permission: str, *also: str) -> Any:  # noqa: N802 — tip kabi ishlatiladi: `u: Can("orders.view")`
    """Ruxsat egasi (+ `also` rollar, masalan mijoz o'z chekini ko'radi) — aks holda 403"""
    return Annotated[AuthUser, Depends(require_roles(*PERMISSIONS[permission], *also))]
