"""
Buyurtma statuslari o'tishlari. To'liq tavsif: docs/02-state-machine.md.
packages/shared/src/order-state-machine.ts bilan bir xil. Faqat "sof" qoidalar —
bazaga bog'liq shartlar (qoldiq, avans, kredit limiti) API servisida tekshiriladi.
"""

from dataclasses import dataclass
from typing import Literal

ROLES = ("CUSTOMER", "MANAGER", "SUPER_ADMIN", "WAREHOUSE", "DRIVER")
STAFF_ROLES = ("MANAGER", "SUPER_ADMIN", "WAREHOUSE", "DRIVER")


@dataclass(frozen=True)
class Transition:
    from_status: str
    to: str
    roles: tuple[str, ...]
    delivery_type: str | None = None
    # Izoh/sabab majburiymi
    requires_comment: bool = False


MGR = ("MANAGER", "SUPER_ADMIN")
SYSTEM: tuple[str, ...] = ()

ORDER_TRANSITIONS: tuple[Transition, ...] = (
    # Menejer qabul qiladi: shartlar belgilanadi, avans/nasiya tekshiriladi, tovar rezervlanadi
    Transition("NEW", "PREPARING", MGR),
    Transition("PREPARING", "READY", (*MGR, "WAREHOUSE")),
    Transition("READY", "OUT_FOR_DELIVERY", (*MGR, "DRIVER"), delivery_type="DELIVERY"),
    Transition("READY", "DELIVERED", (*MGR, "WAREHOUSE"), delivery_type="PICKUP"),
    Transition("OUT_FOR_DELIVERY", "DELIVERED", (*MGR, "DRIVER")),
    Transition("OUT_FOR_DELIVERY", "READY", (*MGR, "DRIVER"), requires_comment=True),
    Transition("DELIVERED", "COMPLETED", SYSTEM),
    Transition("NEW", "CANCELLED", ("CUSTOMER", *MGR), requires_comment=True),
    # PREPARING'dan menejer faqat raspilsiz buyurtmani bekor qila oladi (API'da tekshiriladi)
    Transition("PREPARING", "CANCELLED", MGR, requires_comment=True),
    Transition("READY", "CANCELLED", ("SUPER_ADMIN",), requires_comment=True),
)

TERMINAL_STATUSES = ("COMPLETED", "CANCELLED")
# Mijoz o'z buyurtmasini qaysi statuslarda bekor qila oladi
CUSTOMER_CANCELLABLE = ("NEW",)
# Shu statuslarda tovar rezervda turadi
RESERVED_STATUSES = ("PREPARING", "READY")

TransitionError = Literal["NO_SUCH_TRANSITION", "FORBIDDEN_ROLE", "WRONG_DELIVERY_TYPE", "COMMENT_REQUIRED"]


@dataclass(frozen=True)
class TransitionCheck:
    ok: bool
    transition: Transition | None = None
    reason: TransitionError | None = None


def find_transition(from_status: str, to: str) -> Transition | None:
    return next((t for t in ORDER_TRANSITIONS if t.from_status == from_status and t.to == to), None)


def check_transition(
    *, from_status: str, to: str, role: str | None, delivery_type: str, comment: str | None = None
) -> TransitionCheck:
    """role None bo'lsa — tizim (cron, avtomatik o'tish)"""
    t = find_transition(from_status, to)
    if not t:
        return TransitionCheck(False, reason="NO_SUCH_TRANSITION")
    if role is not None and role not in t.roles:
        return TransitionCheck(False, reason="FORBIDDEN_ROLE")
    if t.delivery_type and t.delivery_type != delivery_type:
        return TransitionCheck(False, reason="WRONG_DELIVERY_TYPE")
    if t.requires_comment and not (comment or "").strip():
        return TransitionCheck(False, reason="COMMENT_REQUIRED")
    return TransitionCheck(True, transition=t)


def available_transitions(from_status: str, role: str, delivery_type: str) -> list[Transition]:
    """UI uchun: shu rol shu statusdan qaysi statuslarga o'tkaza oladi"""
    return [
        t
        for t in ORDER_TRANSITIONS
        if t.from_status == from_status and role in t.roles and (not t.delivery_type or t.delivery_type == delivery_type)
    ]
