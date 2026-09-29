"""Rute ORS: profil truk dulu, jatuh ke mobil bila rute truk tidak ada; hasil di-cache."""

import pytest

from app.core.errors import UpstreamError
from app.integrations.routing import openrouteservice as ors


@pytest.fixture(autouse=True)
def _kosongkan_cache() -> None:
    ors._CACHE.clear()


def _palsu(monkeypatch: pytest.MonkeyPatch, gagal: set[str]) -> list[str]:
    dipanggil: list[str] = []

    async def get_route(origin, destination, *, profile=ors.PROFIL_TRUK):  # type: ignore[no-untyped-def]
        dipanggil.append(profile)
        if profile in gagal:
            raise UpstreamError("ORS: tidak ada rute")
        return ors.RouteResult(polyline="x", distance_km=100, duration_min=120, truk=profile == ors.PROFIL_TRUK)

    monkeypatch.setattr(ors, "get_route", get_route)
    return dipanggil


async def test_pakai_profil_truk(monkeypatch: pytest.MonkeyPatch) -> None:
    dipanggil = _palsu(monkeypatch, gagal=set())
    hasil = await ors.try_get_route(-6.2, 106.8, -7.2, 112.7)
    assert hasil is not None and hasil.truk
    assert dipanggil == [ors.PROFIL_TRUK]


async def test_rute_truk_gagal_jatuh_ke_mobil(monkeypatch: pytest.MonkeyPatch) -> None:
    dipanggil = _palsu(monkeypatch, gagal={ors.PROFIL_TRUK})
    hasil = await ors.try_get_route(-6.2, 106.8, -7.2, 112.7)
    assert hasil is not None and not hasil.truk
    assert dipanggil == [ors.PROFIL_TRUK, ors.PROFIL_MOBIL]


async def test_semua_gagal_none(monkeypatch: pytest.MonkeyPatch) -> None:
    _palsu(monkeypatch, gagal={ors.PROFIL_TRUK, ors.PROFIL_MOBIL})
    assert await ors.try_get_route(-6.2, 106.8, -7.2, 112.7) is None


async def test_rute_sama_diambil_dari_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    dipanggil = _palsu(monkeypatch, gagal=set())
    await ors.try_get_route(-6.2, 106.8, -7.2, 112.7)
    await ors.try_get_route(-6.2, 106.8, -7.2, 112.7)
    assert dipanggil == [ors.PROFIL_TRUK]


async def test_koordinat_kosong_tidak_memanggil_ors(monkeypatch: pytest.MonkeyPatch) -> None:
    dipanggil = _palsu(monkeypatch, gagal=set())
    assert await ors.try_get_route(None, 106.8, -7.2, 112.7) is None
    assert dipanggil == []


def test_segmen_laut_dipisah_dari_rute(monkeypatch: pytest.MonkeyPatch) -> None:
    # 4 titik: darat (0→1), ferry (1→3).
    titik = [(-6.0, 106.0), (-6.0, 106.1), (-5.9, 106.1), (-5.8, 106.1)]
    monkeypatch.setattr(ors, "decode_polyline", lambda _: titik)
    route = {
        "geometry": "x",
        "extras": {"waycategory": {"values": [[0, 1, 0], [1, 3, 8]]}},
        "segments": [
            {
                "steps": [
                    {"way_points": [0, 1], "duration": 600, "name": "Jl. Pelabuhan"},
                    {"way_points": [1, 3], "duration": 7200, "name": "Merak - Bakauheni"},
                ]
            }
        ],
    }
    laut = ors._segmen_laut(route)
    assert len(laut) == 1
    assert laut[0].nama == "Merak - Bakauheni"
    assert laut[0].duration_min == 120
    assert 22 < laut[0].distance_km < 23  # 0,2° lintang ≈ 22,2 km


def test_rute_darat_tanpa_segmen_laut() -> None:
    route = {"geometry": "", "extras": {"waycategory": {"values": [[0, 5, 0]]}}, "segments": []}
    assert ors._segmen_laut(route) == []
