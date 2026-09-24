"""Smoke test API: routing, penjagaan auth, dan pemetaan error — tanpa Supabase."""

from fastapi.testclient import TestClient

from app.core.auth import build_current_user


def test_health(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok"}


def test_protected_endpoints_require_bearer(client: TestClient) -> None:
    for path in ("/api/units", "/api/jobs", "/api/notifications", "/api/dashboard", "/api/auth/me"):
        res = client.get(path)
        assert res.status_code == 401, path
        assert "login" in res.json()["detail"].lower()


def test_driver_endpoints_require_session_header(client: TestClient) -> None:
    res = client.get("/api/driver/jobs")
    assert res.status_code == 401
    assert res.json()["detail"] == "Sesi habis. Silakan login lagi."


def test_cron_requires_secret(client: TestClient) -> None:
    assert client.post("/api/cron/sync-mileage/backfill").status_code == 401
    assert (
        client.post(
            "/api/cron/sync-mileage/backfill", headers={"Authorization": "Bearer salah"}
        ).status_code
        == 401
    )


def test_validation_errors_surface_as_422(client: TestClient) -> None:
    res = client.post("/api/driver/login", json={"no_hp": "0812", "pin": "12"})
    assert res.status_code == 422


def test_build_current_user_roles() -> None:
    superadmin = build_current_user(
        user_id="1", email="a@b.id", profile={"nama": "Rika Sari", "role": "superadmin"}
    )
    assert superadmin.role == "superadmin"
    assert superadmin.is_superadmin
    assert superadmin.initials == "RS" and superadmin.allowed_jenis_unit_ids is None

    operator = build_current_user(
        user_id="2",
        email="op@b.id",
        profile={"nama": "Op", "role": "operator", "allowed_jenis_unit_ids": ["x"]},
    )
    assert operator.role == "operator" and operator.allowed_jenis_unit_ids == ["x"]
    assert not operator.is_superadmin


def test_role_resolution_is_fail_safe() -> None:
    """Hanya 'superadmin' yang memberi hak penuh — sisanya jadi operator.

    Termasuk 'owner' yang belum ikut migrasi: kalau ini lolos jadi superadmin,
    backend memberi akses yang justru ditolak RLS di database.
    """
    for role in ("owner", "admin", "", None):
        user = build_current_user(user_id="9", email="x@b.id", profile={"nama": "X", "role": role})
        assert user.role == "operator", f"role {role!r} tidak boleh jadi superadmin"
        assert not user.is_superadmin

    no_profile = build_current_user(user_id="3", email="siapa@b.id", profile=None)
    assert no_profile.nama == "siapa" and no_profile.role == "operator"


def test_build_current_user_multi_role_memakai_role_aktif() -> None:
    profil = {"nama": "Rika", "roles": ["operator", "superadmin"], "allowed_jenis_unit_ids": ["j1"]}
    op = build_current_user(user_id="1", email="r@b.id", profile={**profil, "role_aktif": "operator"})
    assert op.role == "operator" and op.roles == ["operator", "superadmin"] and op.allowed_jenis_unit_ids == ["j1"]
    sa = build_current_user(user_id="1", email="r@b.id", profile={**profil, "role_aktif": "superadmin"})
    assert sa.is_superadmin and sa.allowed_jenis_unit_ids is None
    # Tanpa role aktif (sesi belum ada): role paling terbatas, bukan superadmin.
    assert build_current_user(user_id="1", email="r@b.id", profile=profil).role == "operator"
