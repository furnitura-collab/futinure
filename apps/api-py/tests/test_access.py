"""Super admin rollarga ruxsat belgilaydi: o'zgarish darhol kuchga kiradi, bazada saqlanadi, qulflar buzilmaydi"""

from app.auth import permissions
from tests.support import Ctx, seed_catalog, user_with_token

URL = "/api/v1/admin/access/roles"


async def save(ctx: Ctx, auth: dict[str, str], matrix: dict[str, list[str]], status: int = 200) -> dict:
    res = await ctx.http.put(URL, headers=auth, json={"matrix": matrix})
    assert res.status_code == status, res.text
    return res.json()


async def test_only_super_admin_sees_and_edits_roles(ctx: Ctx):
    admin = (await user_with_token(ctx, "SUPER_ADMIN")).auth
    manager = (await user_with_token(ctx, "MANAGER")).auth
    assert (await ctx.http.get(URL, headers=manager)).status_code == 403
    assert (await ctx.http.put(URL, headers=manager, json={"matrix": {}})).status_code == 403
    view = (await ctx.http.get(URL, headers=admin)).json()
    assert view["matrix"] == view["defaults"] == permissions.defaults()
    assert view["roles"] == ["MANAGER", "WAREHOUSE"] and view["superAdminOnly"] == ["staff.manage"]


async def test_revoke_and_grant_apply_immediately(ctx: Ctx):
    c = await seed_catalog(ctx)
    admin = (await user_with_token(ctx, "SUPER_ADMIN")).auth
    manager = (await user_with_token(ctx, "MANAGER")).auth
    warehouse = (await user_with_token(ctx, "WAREHOUSE")).auth
    brand = {"name": "Egger"}
    assert (await ctx.http.post("/api/v1/admin/brands", headers=manager, json=brand)).status_code == 201

    matrix = permissions.defaults()
    matrix["MANAGER"].remove("catalog.edit")
    matrix["WAREHOUSE"].append("payments.manage")
    await save(ctx, admin, matrix)

    assert (await ctx.http.post("/api/v1/admin/brands", headers=manager, json={"name": "Rehau"})).status_code == 403
    assert (
        await ctx.http.patch(f"/api/v1/admin/products/{c.board.id}", headers=manager, json={"nameUz": "x"})
    ).status_code == 403
    assert "catalog.edit" not in (await ctx.http.get("/api/v1/me", headers=manager)).json()["permissions"]
    assert (await ctx.http.get("/api/v1/admin/payments", headers=warehouse)).status_code == 200
    assert "payments.manage" in (await ctx.http.get("/api/v1/me", headers=warehouse)).json()["permissions"]
    # Super admin — doim hammasi
    assert (await ctx.http.post("/api/v1/admin/brands", headers=admin, json={"name": "Blum"})).status_code == 201

    # Saqlangan: boshqa server nusxasi (xotira bo'sh) ham bazadan o'qiydi
    permissions.reset()
    assert (await ctx.http.post("/api/v1/admin/brands", headers=manager, json={"name": "GTV"})).status_code == 403

    await save(ctx, admin, permissions.defaults())
    assert (await ctx.http.post("/api/v1/admin/brands", headers=manager, json={"name": "GTV"})).status_code == 201


async def test_locked_permission_and_unknown_values(ctx: Ctx):
    admin = (await user_with_token(ctx, "SUPER_ADMIN")).auth
    manager = (await user_with_token(ctx, "MANAGER")).auth
    # Xodimlarni boshqarish boshqa rolga berilmaydi — e'tiborsiz qoladi
    view = await save(ctx, admin, {"MANAGER": ["orders.view", "staff.manage"]})
    assert view["matrix"]["MANAGER"] == ["orders.view"]
    assert view["matrix"]["WAREHOUSE"] == permissions.defaults()["WAREHOUSE"]
    assert (await ctx.http.get("/api/v1/admin/staff", headers=manager)).status_code == 403

    await save(ctx, admin, {"MANAGER": ["orders.fly"]}, 422)
    await save(ctx, admin, {"SUPER_ADMIN": []}, 422)
    await save(ctx, admin, {"CUSTOMER": ["orders.view"]}, 422)
