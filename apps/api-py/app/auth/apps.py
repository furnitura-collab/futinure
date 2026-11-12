"""
Qaysi ilovaga qaysi rollar kiradi. Kirish so'rovi `app` ni aytadi; rol mos kelmasa token berilmaydi —
aks holda admin mijoz ilovasiga (yoki mijoz admin panelga) kirib olardi.
Frontend'lardagi ro'yxat: packages/shared/src/enums.ts (APP_ROLES) — tests/test_unit.py solishtiradi.
"""

from typing import Literal

from app.core.errors import AppError

ClientApp = Literal["customer", "admin"]

APP_ROLES: dict[str, frozenset[str]] = {
    # Haydovchi ham mobil ilovadan ishlaydi
    "customer": frozenset({"CUSTOMER", "DRIVER"}),
    "admin": frozenset({"MANAGER", "SUPER_ADMIN", "WAREHOUSE"}),
}

_WRONG_APP = {
    "customer": ("USE_ADMIN_PANEL", "Xodimlar admin paneldan kiradi"),
    "admin": ("PANEL_FORBIDDEN", "Bu hisob bilan admin panelga kirib bo'lmaydi"),
}


def wrong_app(app: ClientApp) -> AppError:
    code, message = _WRONG_APP[app]
    return AppError(code, message, 403)


def ensure_app_role(app: ClientApp, role: str) -> None:
    if role not in APP_ROLES[app]:
        raise wrong_app(app)


def can_self_register(app: ClientApp) -> bool:
    """Yangi raqam o'zi ro'yxatdan o'tadi faqat mijoz ilovasida — admin panel hisob yaratmaydi"""
    return app == "customer"
