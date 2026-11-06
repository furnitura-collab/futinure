"""
Miqdorlar kasr bo'lishi mumkin (12.5 m kromka), shuning uchun float o'rniga
"milli" butun sonlar bilan ishlaymiz: 12.5 → 12500. DB'da NUMERIC(12,3).
packages/shared/src/quantity.ts bilan bir xil.
"""

import re
from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

QTY_SCALE = 1000
_QTY_RE = re.compile(r"^\d{1,9}(\.\d{1,3})?$")

QtyInput = str | int | float | Decimal


def _number_to_plain(n: float | int | Decimal) -> str | None:
    if isinstance(n, Decimal):
        if not n.is_finite() or n < 0:
            return None
        return format(n.normalize(), "f") if n != 0 else "0"
    if n != n or n in (float("inf"), float("-inf")) or n < 0:
        return None
    # 0.1 + 0.2 kabi float shovqinini kesib tashlaymiz (JS: String(Math.round(n*1000)/1000))
    v = round(n * QTY_SCALE) / QTY_SCALE
    return str(int(v)) if float(v).is_integer() else repr(float(v))


def to_milli(qty: QtyInput) -> int | None:
    """ "12.5" → 12500. Noto'g'ri format, manfiy yoki 3 xonadan ko'p kasr bo'lsa None."""
    if isinstance(qty, bool):
        return None
    s = _number_to_plain(qty) if not isinstance(qty, str) else qty.strip()
    if s is None or not _QTY_RE.match(s):
        return None
    whole, _, frac = s.partition(".")
    return int(whole) * QTY_SCALE + int(frac.ljust(3, "0"))


def from_milli(milli: int) -> str:
    """12500 → "12.5" """
    whole = int(milli / QTY_SCALE)
    frac = str(milli % QTY_SCALE).rjust(3, "0").rstrip("0")
    return f"{whole}.{frac}" if frac else str(whole)


def to_decimal(qty: QtyInput) -> Decimal:
    milli = to_milli(qty)
    if milli is None:
        raise ValueError(f"Invalid qty: {qty}")
    return Decimal(milli) / QTY_SCALE


QtyError = Literal["INVALID", "ZERO", "BELOW_MIN", "NOT_MULTIPLE_OF_STEP"]


@dataclass(frozen=True)
class QtyCheck:
    ok: bool
    milli: int = 0
    error: QtyError | None = None


def validate_qty(qty: QtyInput, *, min_qty: QtyInput, qty_step: QtyInput) -> QtyCheck:
    """
    Savat va buyurtma uchun miqdor qoidalari.
    Qadam min_qty'dan emas, 0'dan hisoblanadi: step=100 bo'lsa 100, 200, 300...
    """
    milli = to_milli(qty)
    mn = to_milli(min_qty)
    step = to_milli(qty_step)
    if milli is None or mn is None or step is None:
        return QtyCheck(False, error="INVALID")
    if milli == 0:
        return QtyCheck(False, error="ZERO")
    if milli < mn:
        return QtyCheck(False, error="BELOW_MIN")
    if step > 0 and milli % step != 0:
        return QtyCheck(False, error="NOT_MULTIPLE_OF_STEP")
    return QtyCheck(True, milli=milli)
