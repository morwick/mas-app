"""Log sistem: IP pengguna diteruskan ke database, login/logout dicatat."""

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from starlette.requests import Request

from app.core.config import get_settings
from app.core.errors import UnauthorizedError
from app.core.request_context import ip_dari_request, ip_klien, ua_klien
from app.core.supabase import SupabaseClientFactory
from app.modules.auth.service import _akhiri_sesi, _mulai_sesi


def _request(headers: dict[str, str], host: str = "10.0.0.5") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (host, 1234),
    }
    return Request(scope)


def test_ip_dari_proxy_diambil_dari_kanan_sesuai_jumlah_proxy() -> None:
    # Klien mengarang "1.1.1.1"; proxy tepercaya menambahkan IP asli di kanan.
    req = _request({"X-Forwarded-For": "1.1.1.1, 203.0.113.7"})
    assert ip_dari_request(req, 1) == "203.0.113.7"
    # Dua proxy (mis. CDN + load balancer): entri ke-2 dari kanan.
    req2 = _request({"X-Forwarded-For": "1.1.1.1, 203.0.113.7, 172.16.0.9"})
    assert ip_dari_request(req2, 2) == "203.0.113.7"


def test_ip_header_proxy_diabaikan_tanpa_proxy_tepercaya() -> None:
    req = _request({"X-Forwarded-For": "1.1.1.1"})
    assert ip_dari_request(req, 0) == "10.0.0.5"


def test_ip_tanpa_proxy_pakai_koneksi_langsung() -> None:
    assert ip_dari_request(_request({})) == "10.0.0.5"


def test_ip_ikut_header_ke_database() -> None:
    async def jalan() -> dict[str, str]:
        token = ip_klien.set("203.0.113.7")
        try:
            async with SupabaseClientFactory(get_settings()).for_user("jwt") as client:
                return dict(client.options.headers)
        finally:
            ip_klien.reset(token)

    headers = asyncio.run(jalan())
    assert headers.get("x-client-ip") == "203.0.113.7"


class _FakeDb:
    def __init__(self, gagal: bool = False) -> None:
        self.panggilan: list[tuple[str, dict[str, Any]]] = []
        self._gagal = gagal

    def rpc(self, nama: str, params: dict[str, Any] | None = None) -> "_FakeDb":
        self.panggilan.append((nama, params or {}))
        return self

    async def execute(self) -> SimpleNamespace:
        if self._gagal:
            raise RuntimeError("database mati")
        return SimpleNamespace(data=None)


def test_login_membuat_sesi_dengan_ip_dan_browser() -> None:
    db = _FakeDb()
    t_ip, t_ua = ip_klien.set("203.0.113.7"), ua_klien.set("Chrome")
    try:
        asyncio.run(_mulai_sesi(db))  # type: ignore[arg-type]
    finally:
        ip_klien.reset(t_ip)
        ua_klien.reset(t_ua)
    assert db.panggilan == [("mulai_sesi", {"p_ip": "203.0.113.7", "p_user_agent": "Chrome"})]


def test_sesi_gagal_dibuat_membatalkan_login() -> None:
    with pytest.raises(UnauthorizedError):
        asyncio.run(_mulai_sesi(_FakeDb(gagal=True)))  # type: ignore[arg-type]


def test_logout_mengakhiri_sesi_dan_tidak_menggagalkan_logout() -> None:
    db = _FakeDb()
    asyncio.run(_akhiri_sesi(db))  # type: ignore[arg-type]
    assert db.panggilan == [("akhiri_sesi", {})]
    asyncio.run(_akhiri_sesi(_FakeDb(gagal=True)))  # type: ignore[arg-type]
