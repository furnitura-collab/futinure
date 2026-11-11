"""
Excel'dan katalog import.
Avval dry-run (commit=False) — nima o'zgarishini ko'rsatadi.
Kamida bitta xato bo'lsa hech narsa saqlanmaydi (hammasi yoki hech narsa).
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import AuthUser
from app.modules.catalog.excel_apply import _apply
from app.modules.catalog.excel_diff import _diff, _load_context
from app.modules.catalog.excel_plan import TIER_ANY, TIER_QTY, Context, Issue, ProductPlan, Sheet, VariantRow, empty_summary
from app.modules.catalog.excel_read import _parse_rows, _read_header, _read_sheet

__all__ = ["import_catalog", "Issue", "TIER_QTY", "TIER_ANY", "VariantRow", "ProductPlan", "Context", "Sheet", "empty_summary"]


async def import_catalog(db: AsyncSession, buf: bytes, commit: bool, actor: AuthUser) -> dict[str, Any]:
    sheet = _read_sheet(buf)
    errors: list[Issue] = []
    warnings: list[Issue] = []

    header = _read_header(sheet, errors)
    if errors:
        return _result(False, 0, errors, warnings)

    plans = _parse_rows(sheet, header, errors, warnings)
    row_count = max(0, sheet.actual_row_count - 1)
    if errors:
        return _result(False, row_count, errors, warnings)

    ctx = await _load_context(db, plans)
    summary = _diff(plans, ctx, header, errors, warnings)
    if errors or not commit:
        return _result(False, row_count, errors, warnings, summary)

    await _apply(db, plans, ctx, summary, actor)
    return _result(True, row_count, errors, warnings, summary)


def _result(
    committed: bool,
    rows: int,
    errors: list[Issue],
    warnings: list[Issue],
    summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "committed": committed,
        "rows": rows,
        "summary": summary or empty_summary(),
        "errors": sorted(errors, key=lambda e: e["row"])[:500],
        "warnings": warnings[:200],
    }
