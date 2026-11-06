"""
Katalog Excel formati.
Bitta qator = bitta variant (SKU). Bir xil product_code'li qatorlar bitta mahsulotning variantlari.

Dinamik ustunlar:
  attr:<nom>        — variant xususiyati (attr:color, attr:thickness)
  group:<guruh>     — guruh narxi (group:Usta)
  tier<N>_qty/price — pog'onali narx (tier1_qty, tier1_price, ...)
"""

import json
import math
import re
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from app.core.serialize import iso
from app.domain.quantity import from_milli, to_milli
from app.modules.catalog.schemas import PRODUCT_KINDS, UNITS

PRODUCT_COLUMNS = (
    "product_code",
    "category_slug",
    "brand",
    "name_uz",
    "name_ru",
    "unit",
    "kind",
    "min_qty",
    "qty_step",
    "weight_kg",
    "volume_m3",
    "board_length_mm",
    "board_width_mm",
    "thickness_mm",
)

VARIANT_COLUMNS = ("sku", "price", "stock", "low_stock", "on_order", "lead_time_days", "active")

REQUIRED_COLUMNS = ("product_code", "category_slug", "name_uz", "name_ru", "unit", "sku", "price")

SHEET_NAME = "Mahsulotlar"
MAX_ROWS = 10_000

COLUMN_HELP: dict[str, str] = {
    "product_code": "Mahsulot kodi. Bir xil kodli qatorlar — bitta mahsulotning variantlari (majburiy)",
    "category_slug": "Kategoriya slug'i, masalan: ldsp (majburiy)",
    "brand": "Brend nomi. Yo'q bo'lsa avtomatik yaratiladi",
    "name_uz": "Nomi o'zbekcha (majburiy)",
    "name_ru": "Nomi ruscha (majburiy)",
    "unit": f"O'lchov birligi: {', '.join(UNITS)} (majburiy)",
    "kind": f"Turi: {', '.join(PRODUCT_KINDS)}. BOARD — raspilga yaroqli plita",
    "min_qty": "Minimal buyurtma miqdori (default 1)",
    "qty_step": "Miqdor qadami: 100 bo'lsa faqat 100, 200, 300... (default 1)",
    "weight_kg": "1 birlik og'irligi, kg",
    "volume_m3": "1 birlik hajmi, m³",
    "board_length_mm": "Plita uzunligi, mm (BOARD uchun majburiy)",
    "board_width_mm": "Plita eni, mm (BOARD uchun majburiy)",
    "thickness_mm": "Qalinligi, mm",
    "sku": "Artikul, takrorlanmas (majburiy)",
    "price": "Chakana narx, so'm (majburiy)",
    "stock": "Haqiqiy qoldiq. Bo'sh qoldirilsa o'zgarmaydi. Farq bo'lsa inventarizatsiya yozuvi yaratiladi",
    "low_stock": "Shu miqdordan kam qolsa ogohlantirish",
    "on_order": "Buyurtma asosida (ha/yo'q): qoldiq yo'q bo'lsa ham buyurtma qabul qilinadi",
    "lead_time_days": "Buyurtma asosida bo'lsa, necha kunda keladi",
    "active": "Sotuvda (ha/yo'q), default ha",
    "attr:<nom>": "Xususiyat: attr:color, attr:decor_code, attr:thickness va h.k.",
    "group:<guruh>": "Guruh narxi: group:Usta, group:Diler. Bo'sh — guruh narxi yo'q",
    "tier<N>_qty / tier<N>_price": "Pog'onali narx: tier1_qty=10, tier1_price=385000 → 10 tadan boshlab shu narx",
}

# Parsed: (True, qiymat) | (False, xato matni)
Parsed = tuple[bool, Any]


def ok(value: Any) -> Parsed:
    return (True, value)


def fail(error: str) -> Parsed:
    return (False, error)


# ───────────── JS bilan bir xil son ko'rinishi ─────────────


def js_number(n: float | int) -> float | int:
    """JS'da son butun bo'lsa int (JSON'da "16", "16.0" emas)"""
    if isinstance(n, float) and n.is_integer() and math.isfinite(n):
        return int(n)
    return n


def js_str(n: float | int) -> str:
    """String(n) — JS ko'rinishi"""
    n = js_number(n)
    return str(n) if isinstance(n, int) else repr(n)


# ───────────── Hujayra qiymatlarini o'qish ─────────────


def cell_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return js_str(value)
    if isinstance(value, Decimal):
        return js_str(float(value))
    if isinstance(value, datetime):
        return iso(value if value.tzinfo else value.replace(tzinfo=UTC))
    if isinstance(value, date):
        return iso(datetime(value.year, value.month, value.day, tzinfo=UTC))
    return str(value).strip()


_WS = re.compile(r"\s")


def parse_money(s: str) -> Parsed:
    """ "395 000", "395,000" → 395000"""
    clean = re.sub(r",(?=[0-9]{3}([^0-9]|$))", "", _WS.sub("", s))
    if not re.fullmatch(r"[0-9]{1,13}", clean):
        return fail("butun musbat son bo'lishi kerak")
    return ok(int(clean))


def parse_qty(s: str) -> Parsed:
    """ "12,5" ham qabul qilinadi. Normallashgan "12.5" qaytaradi"""
    milli = to_milli(_WS.sub("", s.replace(",", ".", 1)))
    return fail("son bo'lishi kerak (maks 3 kasr xona)") if milli is None else ok(from_milli(milli))


def parse_int0(s: str, mx: int) -> Parsed:
    if not re.fullmatch(r"[0-9]+", s):
        return fail("butun son bo'lishi kerak")
    n = int(s)
    return fail(f"{mx} dan oshmasligi kerak") if n > mx else ok(n)


def parse_decimal(s: str, max_fraction: int, mx: float) -> Parsed:
    clean = _WS.sub("", s.replace(",", ".", 1))
    if not re.fullmatch(rf"[0-9]+(\.[0-9]{{1,{max_fraction}}})?", clean):
        return fail(f"son bo'lishi kerak (maks {max_fraction} kasr xona)")
    n = js_number(float(clean))
    return fail(f"{js_str(mx)} dan oshmasligi kerak") if n > mx else ok(n)


TRUE = {"ha", "yes", "true", "1", "да", "+"}
FALSE = {"yo'q", "yoq", "yo‘q", "no", "false", "0", "нет", "-"}


def parse_bool(s: str) -> Parsed:
    v = s.lower()
    if v in TRUE:
        return ok(True)
    if v in FALSE:
        return ok(False)
    return fail('"ha" yoki "yo\'q" bo\'lishi kerak')


def _parse_enum(s: str, values: tuple[str, ...]) -> Parsed:
    v = s.upper()
    return ok(v) if v in values else fail(f"quyidagilardan biri: {', '.join(values)}")


def parse_unit(s: str) -> Parsed:
    return _parse_enum(s, UNITS)


def parse_kind(s: str) -> Parsed:
    return _parse_enum(s, PRODUCT_KINDS)


_ATTR_NUMBER = re.compile(r"-?(0|[1-9][0-9]*)([.,][0-9]+)?")


def attr_value(s: str) -> str | int | float:
    """
    Atribut qiymati: son bo'lsa son, aks holda matn.
    Boshida nol bo'lgan kodlar ("0190" dekor kodi) matn bo'lib qoladi.
    """
    return js_number(float(s.replace(",", ".", 1))) if _ATTR_NUMBER.fullmatch(s) else s


def stable_json(v: Any) -> str:
    """Kalitlar tartibidan qat'i nazar taqqoslash uchun (JSON.stringify ko'rinishida)"""
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(stable_json(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(f"{json.dumps(k, ensure_ascii=False)}:{stable_json(v[k])}" for k in sorted(v)) + "}"
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return js_str(v)
    return json.dumps(v, ensure_ascii=False)
