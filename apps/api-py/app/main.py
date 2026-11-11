"""
Ilova: FastAPI (/api/v1) + Socket.IO (/socket.io, namespace /rt) + statik fayllar + web (admin va mobil SPA).

Modullar avtomatik ulanadi — app/modules/<nom>/router.py ichida:
  router            APIRouter (api_router()) — /api/v1 ostiga
  background_tasks  ixtiyoriy, [async def ...()] — ishga tushganda fon vazifasi (testda o'chiq)
"""

import asyncio
import importlib
import logging
import pkgutil
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from typing import Any

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

import app.modules as modules_pkg
from app import db
from app.config import get_settings
from app.core import errors, timing
from app.core import redis as redis_mod
from app.services import realtime
from app.services.storage import storage

log = logging.getLogger("app")

API_PREFIX = "/api/v1"


def _discover() -> list[Any]:
    found = []
    for info in sorted(pkgutil.iter_modules(modules_pkg.__path__), key=lambda m: m.name):
        try:
            found.append(importlib.import_module(f"app.modules.{info.name}.router"))
        except ModuleNotFoundError as e:
            if e.name != f"app.modules.{info.name}.router":
                raise
    return found


def create_app() -> FastAPI:
    env = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s [%(name)s] %(message)s")
    mods = _discover()
    tasks: list[Callable[[], Awaitable[None]]] = [t for m in mods for t in getattr(m, "background_tasks", [])]

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        running = [] if env.NODE_ENV == "test" else [asyncio.create_task(t(), name=t.__qualname__) for t in tasks]
        try:
            yield
        finally:
            for t in running:
                t.cancel()
            for t in running:
                with suppress(asyncio.CancelledError):
                    await t
            await db.dispose()
            await redis_mod.close()

    app = FastAPI(
        title="Mebel Order API",
        lifespan=lifespan,
        docs_url=f"{API_PREFIX}/docs",
        openapi_url=f"{API_PREFIX}/openapi.json",
        redoc_url=None,
    )
    errors.install(app)
    timing.install(app)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"], expose_headers=["*"])

    for m in mods:
        app.include_router(m.router, prefix=API_PREFIX)

    _catalog_files(app)
    if env.WEB_DIR:
        _serve_web(app, env.WEB_DIR)
    return app


def _catalog_files(app: FastAPI) -> None:
    """Faqat katalog rasmlari ochiq. "private" (to'lov cheklari) hech qachon statik berilmaydi."""
    store = storage()
    if store.public_url(""):
        # Supabase Storage'da — eski /uploads/catalog/... havolalar o'sha yerga yo'naltiriladi
        @app.get("/uploads/catalog/{key:path}", include_in_schema=False)
        async def _redirect(key: str) -> Response:
            return RedirectResponse(store.public_url(key) or "", status_code=301)

        return
    root = Path(get_settings().UPLOAD_DIR, "catalog")
    root.mkdir(parents=True, exist_ok=True)
    app.mount("/uploads/catalog", StaticFiles(directory=root), name="catalog")


# API'ning o'z yo'llari — SPA fallback ularni yutib yubormasligi kerak
_RESERVED = re.compile(r"^/(api|socket\.io|uploads)(/|$)")


def _serve_web(app: FastAPI, web_dir: str) -> None:
    """
    Bitta serverda deploy: /admin/ — admin panel, / — mobil ilovaning web versiyasi.
    Ikkalasi ham SPA: noma'lum yo'l o'z index.html'iga qaytadi.
    """
    admin = Path(web_dir, "admin").resolve()
    mobile = Path(web_dir, "app").resolve()
    for d in (admin, mobile):
        if not (d / "index.html").exists():
            raise RuntimeError(f"WEB_DIR: {d}/index.html topilmadi")

    def _file(root: Path, rel: str) -> Path | None:
        p = (root / rel).resolve()
        return p if p.is_file() and p.is_relative_to(root) else None

    @app.middleware("http")
    async def web(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        path = request.url.path
        if request.method not in ("GET", "HEAD") or _RESERVED.match(path):
            return await call_next(request)
        is_admin = path == "/admin" or path.startswith("/admin/")
        root = admin if is_admin else mobile
        rel = path[len("/admin") :].lstrip("/") if is_admin else path.lstrip("/")
        # Expo shrift yo'llarida "/.pnpm/" bor — nuqtali papkalar ham beriladi
        if rel and (f := _file(root, rel)):
            return FileResponse(f, headers={"Cache-Control": "public, max-age=3600"})
        if "text/html" not in request.headers.get("accept", "") and "*/*" not in request.headers.get("accept", ""):
            return await call_next(request)
        return FileResponse(root / "index.html", headers={"Cache-Control": "no-cache"})


fastapi_app = create_app()
# Socket.IO /socket.io yo'lida, qolgani FastAPI
app = socketio.ASGIApp(realtime.sio(), other_asgi_app=fastapi_app)
