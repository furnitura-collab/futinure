import re
from pathlib import Path

import pytest
from sqlalchemy import text

from app import models
from app.modules.catalog.excel_format import attr_value, parse_bool, parse_money, parse_qty, stable_json
from tests.support import Ctx

# ───────────────────────── Enum sinxronligi ─────────────────────────

ENUMS = [
    models.ROLE, models.LOCALE, models.CUSTOMER_TYPE, models.UNIT, models.PRODUCT_KIND, models.AVAILABILITY,
    models.ORDER_STATUS, models.DELIVERY_TYPE, models.PAYMENT_TERMS, models.PAYMENT_METHOD, models.PAYMENT_STATUS,
    models.LEDGER_TYPE, models.STOCK_MOVEMENT_TYPE, models.ORDER_ITEM_STATUS,
    models.PRICE_CHANGE_SOURCE, models.CUTTING_LIST_STATUS, models.GRAIN, models.DELIVERY_STATUS,
]  # fmt: skip


@pytest.mark.parametrize("enum", ENUMS, ids=lambda e: e.name)
async def test_enum_matches_database(ctx: Ctx, enum):
    """Modeldagi enum qiymatlari Postgres'dagi enum turi bilan bir xil"""
    rows = await ctx.db.execute(
        text("SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = :name"),
        {"name": enum.name},
    )
    assert sorted(r[0] for r in rows) == sorted(enum.enums)


# ───────────────────────── Excel format ─────────────────────────


def test_parse_money_spaces_and_commas():
    assert parse_money("395 000") == (True, 395_000)
    assert parse_money("395,000") == (True, 395_000)
    assert parse_money("395000.5")[0] is False
    assert parse_money("-1")[0] is False


def test_parse_qty_comma_decimal():
    assert parse_qty("12,5") == (True, "12.5")
    assert parse_qty("1.0001")[0] is False


def test_parse_bool_uz_ru_en():
    for v in ("ha", "Ha", "да", "yes", "1"):
        assert parse_bool(v) == (True, True)
    for v in ("yo'q", "нет", "no", "0"):
        assert parse_bool(v) == (True, False)
    assert parse_bool("balki")[0] is False


def test_attr_value_leading_zero_stays_text():
    assert attr_value("0190") == "0190"
    assert attr_value("16") == 16
    assert attr_value("0.4") == 0.4
    assert attr_value("2,5") == 2.5
    assert attr_value("W980") == "W980"


def test_stable_json_ignores_key_order():
    assert stable_json({"b": 1, "a": [{"d": 2, "c": 3}]}) == stable_json({"a": [{"c": 3, "d": 2}], "b": 1})


# Frontend'lar ishlatadigan @mebel/shared enumlari ham backend bilan bir xil bo'lishi kerak
SHARED_ENUMS = Path(__file__).resolve().parents[3] / "packages/shared/src/enums.ts"
SHARED_NAMES = {
    "ROLES": models.ROLE, "LOCALES": models.LOCALE, "CUSTOMER_TYPES": models.CUSTOMER_TYPE, "UNITS": models.UNIT,
    "PRODUCT_KINDS": models.PRODUCT_KIND, "AVAILABILITIES": models.AVAILABILITY, "ORDER_STATUSES": models.ORDER_STATUS,
    "DELIVERY_TYPES": models.DELIVERY_TYPE, "PAYMENT_TERMS": models.PAYMENT_TERMS, "PAYMENT_METHODS": models.PAYMENT_METHOD,
    "PAYMENT_STATUSES": models.PAYMENT_STATUS, "LEDGER_TYPES": models.LEDGER_TYPE,
    "STOCK_MOVEMENT_TYPES": models.STOCK_MOVEMENT_TYPE, "ORDER_ITEM_STATUSES": models.ORDER_ITEM_STATUS,
    "PRICE_CHANGE_SOURCES": models.PRICE_CHANGE_SOURCE, "DELIVERY_STATUSES": models.DELIVERY_STATUS,
}  # fmt: skip


def test_shared_enums_match_backend():
    found = {
        name: re.findall(r"'([^']+)'", body)
        for name, body in re.findall(r"export const (\w+) = values\(([^)]*)\)", SHARED_ENUMS.read_text())
    }
    assert set(found) == set(SHARED_NAMES)
    for name, enum in SHARED_NAMES.items():
        assert sorted(found[name]) == sorted(enum.enums), name
