"""Biznes vaqti — packages/shared/src/dates.ts bilan bir xil."""

from datetime import UTC, date, datetime, timedelta, timezone

# Toshkent: UTC+5, yozgi vaqt yo'q. Server UTC'da ishlasa ham "bugun" Toshkent bo'yicha
BUSINESS_TZ = timezone(timedelta(hours=5), "Asia/Tashkent")


def business_date(at: datetime | None = None) -> str:
    """YYYY-MM-DD, Toshkent vaqti bo'yicha"""
    return (at or datetime.now(UTC)).astimezone(BUSINESS_TZ).date().isoformat()


def add_days(iso_date: str, days: int) -> str:
    """ "2026-11-03" + n kun"""
    return (date.fromisoformat(iso_date) + timedelta(days=days)).isoformat()


def is_valid_iso_date(s: str) -> bool:
    try:
        return len(s) == 10 and date.fromisoformat(s).isoformat() == s
    except ValueError:
        return False


def day_start(iso_date: str) -> datetime:
    """Toshkent kunining boshi"""
    return datetime.fromisoformat(f"{iso_date}T00:00:00").replace(tzinfo=BUSINESS_TZ)


def next_day_start(iso_date: str) -> datetime:
    return day_start(iso_date) + timedelta(days=1)


def day_range(date_from: str | None = None, date_to: str | None = None) -> tuple[datetime | None, datetime | None]:
    """`from`..`to` kunlari (ikkalasi ham kiradi) — vaqt maydoni filtri uchun: (>= gte, < lt)"""
    return (day_start(date_from) if date_from else None, next_day_start(date_to) if date_to else None)


def to_date(iso_date: str) -> date:
    return date.fromisoformat(iso_date)
