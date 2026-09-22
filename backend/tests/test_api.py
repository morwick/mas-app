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
    owner = build_current_user(user_id="1", email="a@b.id", profile={"nama": "Rika Sari", "role": "owner"})
    assert owner.role == "owner" and owner.initials == "RS" and owner.allowed_jenis_unit_ids is None

    operator = build_current_user(
        user_id="2",
        email="op@b.id",
        profile={"nama": "Op", "role": "operator", "allowed_jenis_unit_ids": ["x"]},
    )
    assert operator.role == "operator" and operator.allowed_jenis_unit_ids == ["x"]

    no_profile = build_current_user(user_id="3", email="siapa@b.id", profile=None)
    assert no_profile.nama == "siapa" and no_profile.role == "owner"
