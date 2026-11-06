"""
Barcha biznes xatolari AppError orqali. Mijoz `code` bo'yicha tarjima qiladi, `message` — dasturchi uchun.
Javob formati: { "error": { "code", "message", "details"? } } — NestJS HttpExceptionFilter bilan bir xil.
"""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, NoResultFound
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.serialize import dump

log = logging.getLogger("exceptions")


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.details = details

    @classmethod
    def not_found(cls, entity: str) -> AppError:
        return cls("NOT_FOUND", f"{entity} topilmadi", 404)

    @classmethod
    def unauthorized(cls, code: str = "UNAUTHORIZED", message: str = "Avtorizatsiya kerak") -> AppError:
        return cls(code, message, 401)

    @classmethod
    def forbidden(cls, message: str = "Ruxsat yo'q") -> AppError:
        return cls("FORBIDDEN", message, 403)


# NestJS HttpStatus nomlari (Python'nikidan farq qiladiganlari ham)
_STATUS_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
}


def error_response(status: int, code: str, message: str, details: Any = None) -> JSONResponse:
    body: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        body["details"] = dump(details)
    return JSONResponse({"error": body}, status_code=status)


def validation_details(errors: list[dict[str, Any]]) -> list[dict[str, str]]:
    out = []
    for e in errors:
        loc = list(e.get("loc", ()))
        # FastAPI manba nomini (body/query/path) qo'shadi — Zod'da yo'q
        if loc and loc[0] in ("body", "query", "path", "header", "form"):
            loc = loc[1:]
        out.append({"path": ".".join(str(p) for p in loc), "message": _zod_message(e)})
    return out


def _js_type(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, (int, float)):
        return "number"
    if isinstance(v, str):
        return "string"
    return "array" if isinstance(v, (list, tuple)) else "object"


def _zod_message(e: dict[str, Any]) -> str:
    """Pydantic'ning standart xabarlarini Zod 4 matniga keltiradi (mijozlar `code` bo'yicha ishlaydi, bu — dasturchi uchun)"""
    kind, ctx, value = e.get("type", ""), e.get("ctx") or {}, e.get("input")
    received = "undefined" if kind == "missing" else _js_type(value)
    expected = {
        "string_type": "string",
        "int_type": "number",
        "int_parsing": "number",
        "float_type": "number",
        "float_parsing": "number",
        "bool_type": "boolean",
        "bool_parsing": "boolean",
        "list_type": "array",
        "dict_type": "object",
        "model_type": "object",
        "model_attributes_type": "object",
    }
    if kind in expected:
        return f"Invalid input: expected {expected[kind]}, received {received}"
    if kind == "int_from_float":
        return "Invalid input: expected int, received number"
    if kind == "missing":
        return "Invalid input: expected nonoptional, received undefined"
    if kind in ("greater_than_equal", "greater_than"):
        op = ">=" if kind == "greater_than_equal" else ">"
        return f"Too small: expected number to be {op}{ctx.get('ge', ctx.get('gt'))}"
    if kind in ("less_than_equal", "less_than"):
        op = "<=" if kind == "less_than_equal" else "<"
        return f"Too big: expected number to be {op}{ctx.get('le', ctx.get('lt'))}"
    if kind == "string_too_short":
        return f"Too small: expected string to have >={ctx.get('min_length')} characters"
    if kind == "string_too_long":
        return f"Too big: expected string to have <={ctx.get('max_length')} characters"
    if kind == "too_short":
        return f"Too small: expected array to have >={ctx.get('min_length')} items"
    if kind == "too_long":
        return f"Too big: expected array to have <={ctx.get('max_length')} items"
    if kind in ("literal_error", "enum"):
        options = ctx.get("expected", "")
        return f"Invalid option: expected one of {options.replace(' or ', '|').replace(', ', '|')}".replace("'", '"')
    if kind == "string_pattern_mismatch":
        return "Invalid string: must match pattern " + str(ctx.get("pattern", ""))
    return str(e.get("msg", ""))


def validation_error(errors: list[dict[str, Any]]) -> AppError:
    return AppError("VALIDATION_ERROR", "Ma'lumotlar noto'g'ri", 422, validation_details(errors))


def install(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, e: AppError) -> JSONResponse:
        return error_response(e.status, e.code, e.message, e.details)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError) -> JSONResponse:
        err = validation_error(list(e.errors()))
        return error_response(err.status, err.code, err.message, err.details)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_CODES.get(e.status_code, "HTTP_ERROR")
        message = e.detail if isinstance(e.detail, str) else code
        if e.status_code == 404 and message == "Not Found":
            message = "Topilmadi"
        return error_response(e.status_code, code, message)

    @app.exception_handler(IntegrityError)
    async def _integrity(_: Request, e: IntegrityError) -> JSONResponse:
        if getattr(e.orig, "sqlstate", None) == "23505" or "UniqueViolation" in type(e.orig).__name__:
            return error_response(409, "CONFLICT", "Bunday yozuv allaqachon mavjud")
        log.exception("DB xatosi", exc_info=e)
        return error_response(500, "INTERNAL", "Ichki xatolik")

    @app.exception_handler(NoResultFound)
    async def _no_result(_: Request, __: NoResultFound) -> JSONResponse:
        return error_response(404, "NOT_FOUND", "Yozuv topilmadi")

    @app.exception_handler(Exception)
    async def _unknown(_: Request, e: Exception) -> JSONResponse:
        log.exception("Kutilmagan xato", exc_info=e)
        return error_response(500, "INTERNAL", "Ichki xatolik")
