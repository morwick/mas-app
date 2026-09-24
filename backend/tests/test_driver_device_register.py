"""Pendaftaran token FCM perangkat driver (FR-MOBILE-05).

Aplikasi mobile memanggil `POST /api/driver/devices` tepat setelah login. Tanpa
baris di `driver_devices`, `push_to_driver` tidak menemukan token dan notifikasi
hanya muncul in-app — jadi jalur ini yang dikunci di sini.
"""

import asyncio
from typing import Any

import pytest

from app.modules.driver_portal.schemas import DeviceRegisterRequest
from app.modules.driver_portal.service import DriverPortalService

TOKEN = "fVx9Contoh-token-fcm-panjang-dari-perangkat"


class FakeRpc:
    """Menangkap panggilan `rpc(...).execute()` tanpa menyentuh Supabase."""

    def __init__(self) -> None:
        self.panggilan: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, name: str, params: dict[str, Any] | None = None) -> "FakeRpc":
        self.panggilan.append((name, params or {}))
        return self

    async def execute(self) -> None:
        return None


@pytest.fixture
def db() -> FakeRpc:
    return FakeRpc()


def test_register_device_memanggil_rpc_dengan_token_dan_platform(db: FakeRpc) -> None:
    svc = DriverPortalService(db)  # type: ignore[arg-type]
    asyncio.run(svc.register_device(fcm_token=TOKEN, platform="android"))
    assert db.panggilan == [
        ("driver_register_device", {"p_fcm_token": TOKEN, "p_platform": "android"})
    ]


def test_logout_mencabut_token_perangkat_ini(db: FakeRpc) -> None:
    # Supaya push tidak menyusul ke HP yang sudah ditinggalkan driver.
    svc = DriverPortalService(db)  # type: ignore[arg-type]
    asyncio.run(svc.logout(fcm_token=TOKEN))
    # Satu panggilan = satu transaksi: perangkat dilepas dan sesi ditutup bersamaan.
    assert db.panggilan == [("driver_logout", {"p_fcm_token": TOKEN})]


def test_logout_tanpa_token_tetap_mencabut_sesi(db: FakeRpc) -> None:
    svc = DriverPortalService(db)  # type: ignore[arg-type]
    asyncio.run(svc.logout(fcm_token=None))
    assert [nama for nama, _ in db.panggilan] == ["driver_logout"]


@pytest.mark.parametrize("platform", ["android", "ios", "web"])
def test_platform_yang_didukung_diteruskan_apa_adanya(platform: str) -> None:
    assert DeviceRegisterRequest(fcm_token=TOKEN, platform=platform).platform == platform


def test_token_kosong_ditolak_sebelum_menyentuh_database() -> None:
    with pytest.raises(ValueError):
        DeviceRegisterRequest(fcm_token="")


def test_platform_asing_ditolak() -> None:
    with pytest.raises(ValueError):
        DeviceRegisterRequest(fcm_token=TOKEN, platform="symbian")
