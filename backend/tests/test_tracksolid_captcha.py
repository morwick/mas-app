"""Login TrackSolid: captcha tidak diakali — login otomatis berhenti dan
superadmin mengetik sendiri kodenya. TrackSolid tidak dihubungi di tes ini."""

import base64
import json
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.integrations.tracksolid import client as ts
from app.integrations.tracksolid.client import CaptchaDiperlukanError, TrackSolidClient


def _token(akun: str = "akun-1") -> str:
    isi = base64.urlsafe_b64encode(json.dumps({"accountId": akun}).encode()).decode().rstrip("=")
    return f"h.{isi}.s"


class _Store:
    def __init__(self, row: dict[str, Any] | None = None) -> None:
        self.row = row
        self.ditandai = 0
        self.disimpan: list[Any] = []

    async def baca(self) -> dict[str, Any] | None:
        return self.row

    async def simpan_otomatis(self, session: Any) -> None:
        self.disimpan.append(session)

    async def tandai_perlu_captcha(self) -> None:
        self.ditandai += 1


def _pasang_login(monkeypatch: pytest.MonkeyPatch, *balasan: dict[str, Any]) -> list[tuple[str, str]]:
    kiriman: list[tuple[str, str]] = []
    antrian = list(balasan)

    async def palsu(valid_code: str = "", cookies: str = "") -> tuple[dict[str, Any], str]:
        kiriman.append((valid_code, cookies))
        return antrian.pop(0), cookies or "JSESSIONID=baru"

    monkeypatch.setattr(TrackSolidClient, "_kirim_login", staticmethod(palsu))
    return kiriman


async def test_butuh_captcha_menandai_dan_berhenti(monkeypatch: pytest.MonkeyPatch) -> None:
    kiriman = _pasang_login(monkeypatch, {"ok": False, "code": ts.KODE_PERLU_CAPTCHA, "msg": "captcha"})
    store = _Store({"token": None, "akun_id": None, "perlu_captcha": False})
    klien = TrackSolidClient(store)  # type: ignore[arg-type]
    with pytest.raises(CaptchaDiperlukanError):
        await klien._get_session()
    assert store.ditandai == 1 and len(kiriman) == 1


async def test_sudah_ditandai_tidak_mencoba_login_lagi(monkeypatch: pytest.MonkeyPatch) -> None:
    kiriman = _pasang_login(monkeypatch)
    klien = TrackSolidClient(_Store({"token": "lama", "akun_id": "a", "perlu_captcha": True}))  # type: ignore[arg-type]
    with pytest.raises(CaptchaDiperlukanError):
        await klien._get_session()
    assert kiriman == []  # akun tidak dibombardir login yang pasti gagal


async def test_sesi_di_database_dipakai_tanpa_login(monkeypatch: pytest.MonkeyPatch) -> None:
    kiriman = _pasang_login(monkeypatch)
    klien = TrackSolidClient(_Store({"token": "tok", "akun_id": "a", "cookies": "c=1", "perlu_captcha": False}))  # type: ignore[arg-type]
    sesi = await klien._get_session()
    assert (sesi.token, sesi.user_id, sesi.cookies) == ("tok", "a", "c=1") and kiriman == []


async def test_token_ditolak_dan_db_sama_maka_login_otomatis_lalu_disimpan(monkeypatch: pytest.MonkeyPatch) -> None:
    _pasang_login(monkeypatch, {"ok": True, "data": {"token": _token()}})
    store = _Store({"token": "tok", "akun_id": "a", "perlu_captcha": False})
    klien = TrackSolidClient(store)  # type: ignore[arg-type]
    await klien._get_session()
    sesi = await klien._get_session(force_refresh=True)
    assert sesi.user_id == "akun-1" and store.disimpan == [sesi]


async def test_login_dengan_captcha_mengirim_kode_dan_cookie_captcha(monkeypatch: pytest.MonkeyPatch) -> None:
    kiriman = _pasang_login(monkeypatch, {"ok": True, "data": {"token": _token()}})
    klien = TrackSolidClient(None)
    sesi = await klien.login_dengan_captcha(" ab12 ", "JSESSIONID=captcha")
    assert kiriman == [("ab12", "JSESSIONID=captcha")]
    # Sesi langsung dipakai proses ini.
    assert await klien._get_session() is sesi


async def test_kode_captcha_salah(monkeypatch: pytest.MonkeyPatch) -> None:
    _pasang_login(monkeypatch, {"ok": False, "code": ts.KODE_PERLU_CAPTCHA, "msg": "validCodeError"})
    with pytest.raises(ValidationError, match="Kode captcha salah"):
        await TrackSolidClient(None).login_dengan_captcha("xxxx", "JSESSIONID=captcha")


class _TsButuhCaptcha:
    async def pastikan_sesi(self) -> None:
        raise CaptchaDiperlukanError()


def test_lokasi_armada_membalas_penanda_captcha() -> None:
    from fastapi.testclient import TestClient

    from app.main import app
    from app.modules.tracking.router import get_fleet_service
    from app.modules.tracking.service import FleetTrackingService

    class _Db:
        def table(self, _nama: str) -> "_Db":
            return self

        @property
        def not_(self) -> "_Db":
            return self

        def __getattr__(self, _nama: str) -> Any:
            return lambda *a, **k: self

        async def execute(self) -> Any:
            from types import SimpleNamespace

            return SimpleNamespace(data=[{"id": "u1", "imei_gps": "353701093101554"}])

    app.dependency_overrides[get_fleet_service] = lambda: FleetTrackingService(_Db(), _TsButuhCaptcha())  # type: ignore[arg-type]
    try:
        res = TestClient(app).get("/api/tracking/units/locations")
    finally:
        app.dependency_overrides.clear()
    assert res.status_code == 502
    assert res.json()["kode"] == ts.KODE_GALAT_CAPTCHA


async def test_cek_sesi_hanya_membaca_database(monkeypatch: pytest.MonkeyPatch) -> None:
    kiriman = _pasang_login(monkeypatch)
    assert (
        await TrackSolidClient(_Store({"token": None, "akun_id": None, "perlu_captcha": True})).perlu_captcha() is True
    )  # type: ignore[arg-type]
    assert (
        await TrackSolidClient(_Store({"token": "t", "akun_id": "a", "perlu_captcha": False})).perlu_captcha() is False
    )  # type: ignore[arg-type]
    assert await TrackSolidClient(None).perlu_captcha() is False
    assert kiriman == []  # TrackSolid tidak dihubungi


async def test_token_kedaluwarsa_saat_ambil_data_banyak_unit_hanya_sekali_login(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Cek /sesi bilang valid, tapi token ditolak TrackSolid saat data diminta:
    login ulang dicoba SEKALI, butuh captcha → semua permintaan berhenti."""
    import asyncio

    kiriman = _pasang_login(monkeypatch, {"ok": False, "code": ts.KODE_PERLU_CAPTCHA, "msg": "captcha"})

    async def token_ditolak(_session: Any, _path: str, _payload: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return 401, {"ok": False, "code": 401, "msg": "token expired"}

    monkeypatch.setattr(TrackSolidClient, "_post_with", staticmethod(token_ditolak))

    class _StoreHidup(_Store):
        async def tandai_perlu_captcha(self) -> None:
            await super().tandai_perlu_captcha()
            assert self.row is not None
            self.row["perlu_captcha"] = True

    store = _StoreHidup({"token": "kedaluwarsa", "akun_id": "a", "perlu_captcha": False})
    klien = TrackSolidClient(store)  # type: ignore[arg-type]
    hasil = await asyncio.gather(
        *(klien.get_vehicle_location(f"35370109310155{i}") for i in range(10)), return_exceptions=True
    )
    assert all(isinstance(h, CaptchaDiperlukanError) for h in hasil)
    assert len(kiriman) == 1  # satu login saja, bukan per unit
    assert store.ditandai == 1
