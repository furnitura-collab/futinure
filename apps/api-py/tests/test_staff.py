import json
from typing import Any

import pytest
from sqlalchemy import select

from app.models import AuditLog
from tests.support import Ctx, UserCtx, assert_matches, user_with_token

PHONE = "+998901112233"
PASSWORD = "staff-pass-1"


@pytest.fixture
async def admin(ctx: Ctx) -> UserCtx:
    return await user_with_token(ctx, "SUPER_ADMIN")


async def login_pw(ctx: Ctx, phone: str, password: str):
    return await ctx.http.post("/api/v1/auth/login", json={"phone": phone, "password": password})


async def refresh(ctx: Ctx, refresh_token: str):
    return await ctx.http.post("/api/v1/auth/refresh", json={"refreshToken": refresh_token})


async def create_staff(ctx: Ctx, admin: UserCtx, body: dict[str, Any]):
    return await ctx.http.post("/api/v1/admin/staff", headers=admin.auth, json=body)


async def patch_staff(ctx: Ctx, admin: UserCtx, id: str, body: dict[str, Any]):
    return await ctx.http.patch(f"/api/v1/admin/staff/{id}", headers=admin.auth, json=body)


async def create_manager(ctx: Ctx, admin: UserCtx) -> dict[str, Any]:
    res = await create_staff(ctx, admin, {"phone": PHONE, "fullName": "Ali Valiyev", "role": "MANAGER", "password": PASSWORD})
    assert res.status_code == 201, res.text
    return res.json()


async def login_ok(ctx: Ctx, phone: str, password: str) -> dict[str, Any]:
    res = await login_pw(ctx, phone, password)
    assert res.status_code == 200, res.text
    return res.json()


# ───────────────────────── /admin/staff ─────────────────────────


async def test_super_admin_only(ctx: Ctx, admin: UserCtx):
    manager = await user_with_token(ctx, "MANAGER")
    customer = await user_with_token(ctx, "CUSTOMER")
    assert (await ctx.http.get("/api/v1/admin/staff", headers=manager.auth)).status_code == 403
    assert (await ctx.http.get("/api/v1/admin/staff", headers=customer.auth)).status_code == 403
    assert (await ctx.http.post("/api/v1/admin/staff", headers=manager.auth, json={})).status_code == 403
    assert (await ctx.http.get("/api/v1/admin/staff")).status_code == 401


async def test_list_only_staff_without_hash(ctx: Ctx, admin: UserCtx):
    await user_with_token(ctx, "CUSTOMER")
    driver = await user_with_token(ctx, "DRIVER")
    res = await ctx.http.get("/api/v1/admin/staff", headers=admin.auth)
    assert res.status_code == 200
    assert sorted(u["id"] for u in res.json()) == sorted([str(admin.user.id), str(driver.user.id)])
    assert sorted(res.json()[0].keys()) == ["createdAt", "fullName", "id", "isActive", "lastLoginAt", "phone", "role"]


async def test_created_staff_logs_in_and_audited(ctx: Ctx, admin: UserCtx):
    res = await create_staff(
        ctx, admin, {"phone": "90 111-22-33", "fullName": "Omborchi Ali", "role": "WAREHOUSE", "password": PASSWORD}
    )
    assert res.status_code == 201
    body = res.json()
    assert_matches(body, {"phone": PHONE, "fullName": "Omborchi Ali", "role": "WAREHOUSE", "isActive": True, "lastLoginAt": None})
    assert "passwordHash" not in body

    login = await login_ok(ctx, PHONE, PASSWORD)
    assert_matches(login["user"], {"id": body["id"], "role": "WAREHOUSE"})

    audit = await ctx.first(select(AuditLog).where(AuditLog.entity == "staff", AuditLog.entity_id == body["id"]))
    assert audit is not None
    assert str(audit.actor_id) == str(admin.user.id)
    assert audit.action == "create"
    assert PASSWORD not in json.dumps(audit.after)


async def test_taken_phone_409_including_customer(ctx: Ctx, admin: UserCtx):
    customer = await user_with_token(ctx, "CUSTOMER")
    res = await create_staff(
        ctx, admin, {"phone": customer.user.phone, "fullName": "Ali Valiyev", "role": "MANAGER", "password": PASSWORD}
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "PHONE_TAKEN"


async def test_validation_customer_role_and_short_password_422(ctx: Ctx, admin: UserCtx):
    res = await create_staff(ctx, admin, {"phone": PHONE, "fullName": "Ali Valiyev", "role": "CUSTOMER", "password": PASSWORD})
    assert res.status_code == 422
    res = await create_staff(ctx, admin, {"phone": PHONE, "fullName": "Ali Valiyev", "role": "MANAGER", "password": "123"})
    assert res.status_code == 422


async def test_edit_name_and_role(ctx: Ctx, admin: UserCtx):
    m = await user_with_token(ctx, "MANAGER")
    res = await patch_staff(ctx, admin, m.user.id, {"fullName": "Yangi Ism", "role": "WAREHOUSE"})
    assert res.status_code == 200
    assert_matches(res.json(), {"id": str(m.user.id), "fullName": "Yangi Ism", "role": "WAREHOUSE"})


async def test_cannot_edit_customer_or_missing_id_404(ctx: Ctx, admin: UserCtx):
    customer = await user_with_token(ctx, "CUSTOMER")
    assert (await patch_staff(ctx, admin, customer.user.id, {"fullName": "Xodim emas"})).status_code == 404
    res = await patch_staff(ctx, admin, "019a0000-0000-7000-8000-000000000000", {"fullName": "Hech kim"})
    assert res.status_code == 404
    assert (await patch_staff(ctx, admin, "not-a-uuid", {"fullName": "Hech kim"})).status_code == 400


async def test_password_change_invalidates_old_and_sessions(ctx: Ctx, admin: UserCtx):
    created = await create_manager(ctx, admin)
    refresh_token = (await login_ok(ctx, PHONE, PASSWORD))["refreshToken"]

    assert (await patch_staff(ctx, admin, created["id"], {"password": "new-pass-2"})).status_code == 200
    assert (await login_pw(ctx, PHONE, PASSWORD)).status_code == 401
    assert (await refresh(ctx, refresh_token)).status_code == 401
    assert (await login_pw(ctx, PHONE, "new-pass-2")).status_code == 200


async def test_block_closes_sessions_and_login_then_reactivate(ctx: Ctx, admin: UserCtx):
    created = await create_manager(ctx, admin)
    refresh_token = (await login_ok(ctx, PHONE, PASSWORD))["refreshToken"]

    assert (await patch_staff(ctx, admin, created["id"], {"isActive": False})).status_code == 200
    assert (await refresh(ctx, refresh_token)).status_code == 401
    assert (await login_pw(ctx, PHONE, PASSWORD)).status_code == 403

    assert (await patch_staff(ctx, admin, created["id"], {"isActive": True})).status_code == 200
    assert (await login_pw(ctx, PHONE, PASSWORD)).status_code == 200


async def test_name_change_keeps_sessions(ctx: Ctx, admin: UserCtx):
    m = await user_with_token(ctx, "MANAGER")
    assert (await patch_staff(ctx, admin, m.user.id, {"fullName": "Boshqa Ism"})).status_code == 200
    assert (await refresh(ctx, m.refresh_token)).status_code == 200


async def test_super_admin_cannot_block_or_demote_self_400(ctx: Ctx, admin: UserCtx):
    for body in [{"isActive": False}, {"role": "MANAGER"}]:
        res = await patch_staff(ctx, admin, admin.user.id, body)
        assert res.status_code == 400
        assert res.json()["error"]["code"] == "CANNOT_MODIFY_SELF"
    res = await patch_staff(ctx, admin, admin.user.id, {"fullName": "Bosh Admin", "role": "SUPER_ADMIN", "isActive": True})
    assert res.status_code == 200
    assert_matches(res.json(), {"fullName": "Bosh Admin", "role": "SUPER_ADMIN", "isActive": True})


async def test_can_demote_other_super_admin(ctx: Ctx, admin: UserCtx):
    other = await user_with_token(ctx, "SUPER_ADMIN")
    assert (await patch_staff(ctx, admin, other.user.id, {"role": "MANAGER"})).status_code == 200


# ───────────────────────── POST /me/password ─────────────────────────


async def change(ctx: Ctx, auth: dict[str, str] | None, body: dict[str, Any]):
    return await ctx.http.post("/api/v1/me/password", headers=auth, json=body)


async def test_change_password_checks_current_closes_other_sessions(ctx: Ctx, admin: UserCtx):
    await create_manager(ctx, admin)
    current = await login_ok(ctx, PHONE, PASSWORD)
    other = await login_ok(ctx, PHONE, PASSWORD)
    auth = {"Authorization": f"Bearer {current['accessToken']}"}

    res = await change(ctx, auth, {"newPassword": "new-pass-2"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_PASSWORD"
    res = await change(ctx, auth, {"currentPassword": "wrong-pass", "newPassword": "new-pass-2"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_PASSWORD"

    assert (await change(ctx, auth, {"currentPassword": PASSWORD, "newPassword": "new-pass-2"})).status_code == 204
    assert (await refresh(ctx, other["refreshToken"])).status_code == 401
    assert (await refresh(ctx, current["refreshToken"])).status_code == 200
    assert (await login_pw(ctx, PHONE, PASSWORD)).status_code == 401
    assert (await login_pw(ctx, PHONE, "new-pass-2")).status_code == 200


async def test_user_without_password_sets_without_current(ctx: Ctx, admin: UserCtx):
    customer = await user_with_token(ctx, "CUSTOMER")
    assert (await change(ctx, customer.auth, {"newPassword": "first-pass"})).status_code == 204
    assert (await login_pw(ctx, customer.user.phone, "first-pass")).status_code == 200


async def test_short_new_password_422_no_token_401(ctx: Ctx, admin: UserCtx):
    customer = await user_with_token(ctx, "CUSTOMER")
    assert (await change(ctx, customer.auth, {"newPassword": "123"})).status_code == 422
    assert (await change(ctx, None, {"newPassword": "first-pass"})).status_code == 401
