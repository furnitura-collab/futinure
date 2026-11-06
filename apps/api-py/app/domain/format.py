"""Formatlash — packages/shared/src/format.ts bilan bir xil natija"""

import re
from datetime import UTC, datetime, timedelta

CURRENCY = {"uz": "so'm", "ru": "сум", "en": "UZS"}
TASHKENT_OFFSET = timedelta(hours=5)


def format_number(amount: int | float) -> str:
    """4620000 → "4 620 000" (JS toFixed(0): .5 noldan uzoqqa yaxlitlanadi)"""
    n = int(amount) if isinstance(amount, int) else int(abs(amount) + 0.5) * (1 if amount >= 0 else -1)
    return f"{n:,}".replace(",", " ")


def format_money(amount: int | float | None, locale: str = "uz") -> str:
    """4620000 → "4 620 000 so'm" / "4 620 000 сум" / "4 620 000 UZS" """
    if amount is None:
        return "—"
    return f"{format_number(amount)} {CURRENCY[locale]}"


def _tashkent(iso: str) -> datetime:
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC) + TASHKENT_OFFSET


def format_date(iso: str | None) -> str:
    """ "03.11.2026" (Toshkent vaqti)"""
    if not iso:
        return "—"
    d = _tashkent(iso)
    return f"{d.day:02d}.{d.month:02d}.{d.year}"


def format_date_time(iso: str | None) -> str:
    """ "03.11.2026 14:05" """
    if not iso:
        return "—"
    d = _tashkent(iso)
    return f"{format_date(iso)} {d.hour:02d}:{d.minute:02d}"


def format_phone(phone: str) -> str:
    """+998901234567 → "+998 90 123 45 67" """
    m = re.fullmatch(r"\+998(\d{2})(\d{3})(\d{2})(\d{2})", phone)
    return f"+998 {m[1]} {m[2]} {m[3]} {m[4]}" if m else phone
