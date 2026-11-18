"""Endpointlar va ularga ruxsat etilgan rollar — FastAPI dependency daraxtidan (require_roles yopilmalari)"""

from collections.abc import Iterator
from typing import Any

from fastapi.routing import APIRoute

from app.main import fastapi_app

PREFIX = "/api/v1"


def _walk(routes: list[Any], prefix: str = "") -> Iterator[tuple[str, APIRoute]]:
    for r in routes:
        if isinstance(r, APIRoute):
            yield prefix + r.path, r
        elif hasattr(r, "original_router"):
            yield from _walk(r.original_router.routes, prefix + r.include_context.prefix)


def _roles(route: APIRoute) -> str:
    roles: set[str] = set()
    auth = False
    stack = [route.dependant]
    while stack:
        d = stack.pop()
        name = getattr(d.call, "__name__", "")
        auth = auth or name == "current_user"
        for cell in (d.call.__closure__ or ()) if name == "dep" else ():
            if isinstance(cell.cell_contents, tuple):
                roles.update(cell.cell_contents)
                auth = True
        stack.extend(d.dependencies)
    return ",".join(sorted(roles)) if roles else ("ANY_AUTH" if auth else "PUBLIC")


def route_roles() -> list[tuple[str, str, str]]:
    """[(METHOD, /yo'l, ROLLAR | ANY_AUTH | PUBLIC)] — saralangan"""
    out = [(m, path.removeprefix(PREFIX), _roles(r)) for path, r in _walk(fastapi_app.routes) for m in r.methods - {"HEAD"}]
    return sorted(out, key=lambda x: (x[1], x[0]))


if __name__ == "__main__":
    # Rollar ataylab o'zgarganda snapshot'ni yangilash: uv run python -m tests.support_routes
    from pathlib import Path

    rows = route_roles()
    Path(__file__).with_name("route_roles.txt").write_text("".join(f"{m:6} {p:52} {r}\n" for m, p, r in rows))
    print(f"{len(rows)} ta endpoint yozildi")
