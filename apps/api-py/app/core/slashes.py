"""API manzilidagi oxirgi slesh yo'naltirishsiz olib tashlanadi: /notifications/ va /notifications — bir xil javob.

Starlette slesh uchun 307 qaytaradi; brauzer eski versiyadan doimiy (308/301) yo'naltirishni keshlagan bo'lsa,
ikkalasi bir-biriga cheksiz yo'naltiradi (bildirishnomalar so'rovlari osilib qolgan edi).
"""

from fastapi import FastAPI
from starlette.types import ASGIApp, Receive, Scope, Send


class _StripTrailingSlash:
    def __init__(self, app: ASGIApp, prefix: str) -> None:
        self.app = app
        self.prefix = prefix

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path: str = scope.get("path", "")
        root = self.prefix + "/"
        if scope["type"] == "http" and path.startswith(root) and path.endswith("/") and path != root:
            scope = {**scope, "path": path.rstrip("/"), "raw_path": path.rstrip("/").encode()}
        await self.app(scope, receive, send)


def install(app: FastAPI, prefix: str) -> None:
    app.add_middleware(_StripTrailingSlash, prefix=prefix)
