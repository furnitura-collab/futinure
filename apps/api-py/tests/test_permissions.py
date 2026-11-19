"""
Rollar va ruxsatlar (docs/15-roles-permissions-prompt.md).

- Har endpoint uchun ruxsat etilgan rollar — tests/route_roles.txt bilan bir xil. Yangi endpoint yoki o'zgargan rol
  testni yiqitadi: ataylab bo'lsa, faylni yangilang (`uv run python -m tests.support_routes`).
- Har rol bilan haqiqiy so'rov: ruxsatsiz — 403, kirmagan — 401.
- Omborchi doirasi: faqat qabul qilingan buyurtmalar, moliyasiz.
"""

import uuid
from pathlib import Path

import pytest

from app.auth.permissions import PERMISSIONS
from tests.support import Ctx, user_with_token
from tests.support_orders import API, accept, admin_order, cast, move, ok, place_order
from tests.support_routes import route_roles

SNAPSHOT = Path(__file__).with_name("route_roles.txt")
ROLES = ("CUSTOMER", "DRIVER", "WAREHOUSE", "MANAGER", "SUPER_ADMIN")


def _allowed(rule: str) -> list[str]:
    """Standart jadval bo'yicha: "perm:orders.view+DRIVER" → ruxsat egalari + qo'shimcha rollar"""
    if not rule.startswith("perm:"):
        return rule.split(",")
    permission, *also = rule.removeprefix("perm:").split("+")
    return [*PERMISSIONS[permission], *also]


GUARDED = [(m, p, _allowed(r)) for m, p, r in route_roles() if r not in ("PUBLIC", "ANY_AUTH")]


def test_route_roles_match_snapshot():
    expected = [tuple(line.split()) for line in SNAPSHOT.read_text().splitlines() if line.strip()]
    assert route_roles() == expected


def _url(path: str) -> str:
    # Yo'l parametrlari — mavjud bo'lmagan qiymatlar: ruxsat tekshiruvi undan oldin ishlaydi
    for name in ("{id}", "{orderId}", "{variant_id}", "{product_id}", "{order_id}", "{image_id}"):
        path = path.replace(name, str(uuid.uuid4()))
    return API + path.replace("{sku}", "NO-SUCH").replace("{token}", "no-such")


@pytest.mark.parametrize("role", ROLES)
async def test_each_role_gets_403_outside_its_permissions(ctx: Ctx, role: str):
    auth = (await user_with_token(ctx, role)).auth
    for method, path, allowed in GUARDED:
        res = await ctx.http.request(method, _url(path), headers=auth, json={})
        if role in allowed:
            assert res.status_code != 403 or res.json()["error"]["code"] != "FORBIDDEN", (role, method, path, res.text)
        else:
            assert res.status_code == 403, (role, method, path, res.status_code)


async def test_anonymous_gets_401(ctx: Ctx):
    for method, path, _ in GUARDED:
        assert (await ctx.http.request(method, _url(path), json={})).status_code == 401, (method, path)


async def test_warehouse_sees_only_accepted_orders_without_finance(ctx: Ctx):
    k = await cast(ctx)
    new = (await place_order(ctx, k, [(k.c.white.id, 1)]))["id"]
    taken = (await place_order(ctx, k, [(k.c.hinge_v.id, 10)], delivery="PICKUP"))["id"]
    await accept(ctx, k, taken, {"paymentTerms": "ON_DELIVERY", "allowedMethods": ["CASH"]})
    wh = k.warehouse_user.auth

    listed = ok(await ctx.http.get(f"{API}/admin/orders", headers=wh))
    assert [o["id"] for o in listed["items"]] == [taken]
    columns = ok(await ctx.http.get(f"{API}/admin/orders/kanban", headers=wh))
    assert [c["status"] for c in columns] == ["PREPARING", "READY", "OUT_FOR_DELIVERY"]
    assert (await ctx.http.get(f"{API}/admin/orders/{new}", headers=wh)).status_code == 404

    detail = ok(await ctx.http.get(f"{API}/admin/orders/{taken}", headers=wh))
    assert detail["payments"] == [] and detail["canSetTerms"] is False
    assert detail["customer"]["customerProfile"]["balanceCached"] is None
    assert [t["to"] for t in detail["availableTransitions"]] == ["READY"]
    # Menejer moliyani ko'radi
    assert (await admin_order(ctx, k, taken))["customer"]["customerProfile"]["balanceCached"] is not None


async def test_warehouse_hands_over_pickup_even_if_it_leaves_scope(ctx: Ctx):
    k = await cast(ctx)
    oid = (await place_order(ctx, k, [(k.c.hinge_v.id, 10)], delivery="PICKUP"))["id"]
    await accept(ctx, k, oid)
    await move(ctx, k.warehouse_user, oid, "READY")
    # Topshirilgach DELIVERED — omborchi doirasidan chiqadi, lekin amal javobi muvaffaqiyatli va moliyasiz
    res = await move(ctx, k.warehouse_user, oid, "DELIVERED", receiverName="Aziz")
    assert res["status"] == "DELIVERED" and res["payments"] == []
    assert (await ctx.http.get(f"{API}/admin/orders/{oid}", headers=k.warehouse_user.auth)).status_code == 404


async def test_wrong_app_login_tells_where_to_go(ctx: Ctx):
    from app.models import User

    for role, app_name, code in (("DRIVER", "admin", "PANEL_FORBIDDEN"), ("MANAGER", "customer", "USE_ADMIN_PANEL")):
        u = await user_with_token(ctx, role)
        phone = (await ctx.get(User, u.user.id)).phone
        res = await ctx.http.post(f"{API}/auth/otp/request", json={"phone": phone})
        assert res.status_code == 200
        code_sms = ctx.sms.last_code(phone)
        res = await ctx.http.post(f"{API}/auth/otp/verify", json={"phone": phone, "code": code_sms, "app": app_name})
        assert (res.status_code, res.json()["error"]["code"]) == (403, code), res.text
