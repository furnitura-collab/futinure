"""
Avtorizatsiya — NestJS global AuthGuard + @Public/@Roles o'rniga FastAPI dependency'lar:

    user: CurrentUser                                   # har qanday kirgan foydalanuvchi
    user: Annotated[AuthUser, Depends(require_roles("MANAGER", "SUPER_ADMIN"))]
    user: OptionalUser                                  # Public yo'l (token bo'lsa o'qiladi — shaxsiy narx)
"""

from collections.abc import Callable, Coroutine
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Request

from app.auth.tokens import decode_access
from app.core.errors import AppError


@dataclass(frozen=True)
class AuthUser:
    id: str
    role: str
    session_family: str | None = None


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization")
    if not header:
        return None
    kind, _, token = header.partition(" ")
    return token if kind == "Bearer" and token and " " not in token else None


async def optional_user(request: Request) -> AuthUser | None:
    """Public yo'l: token yaroqsiz bo'lsa ham xato emas"""
    token = _bearer(request)
    if not token:
        return None
    p = decode_access(token)
    return AuthUser(p.sub, p.role, p.fam) if p else None


async def current_user(request: Request) -> AuthUser:
    token = _bearer(request)
    p = decode_access(token) if token else None
    if not p:
        raise AppError.unauthorized()
    return AuthUser(p.sub, p.role, p.fam)


def require_roles(*roles: str) -> Callable[..., Coroutine[Any, Any, AuthUser]]:
    async def dep(user: Annotated[AuthUser, Depends(current_user)]) -> AuthUser:
        if user.role not in roles:
            raise AppError.forbidden()
        return user

    return dep


CurrentUser = Annotated[AuthUser, Depends(current_user)]
OptionalUser = Annotated[AuthUser | None, Depends(optional_user)]
Staff = Annotated[AuthUser, Depends(require_roles("MANAGER", "SUPER_ADMIN"))]
SuperAdmin = Annotated[AuthUser, Depends(require_roles("SUPER_ADMIN"))]
