"""Catat penjualan unit: harga dikirim ke RPC sebagai bilangan bulat (BIGINT)."""

from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError

from app.modules.penjualan_unit.schemas import PenjualanUnitInput
from app.modules.penjualan_unit.service import PenjualanUnitService, alasan_tidak_bisa_dijual


class _Db:
    def __init__(self) -> None:
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        self.rpc_calls.append((nama, params))
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data="p1")


def _svc(db: _Db) -> PenjualanUnitService:
    svc = PenjualanUnitService.__new__(PenjualanUnitService)
    svc._db = db  # type: ignore[assignment]

    async def boleh(*_: object) -> None:
        return None

    svc._cek_boleh_dijual = boleh  # type: ignore[method-assign]
    return svc


def _input(**over: Any) -> PenjualanUnitInput:
    data: dict[str, Any] = {
        "jenis_aset": "unit",
        "asset_id": "u1",
        "nama_pembeli": "PT Maju",
        "harga_jual": 150_000_000,
        "tanggal_jual": "2026-09-26",
    }
    return PenjualanUnitInput(**{**data, **over})


async def test_harga_dikirim_sebagai_int() -> None:
    db = _Db()
    svc = _svc(db)
    await svc.create(_input(harga_jual=150_000_000.0))
    harga = db.rpc_calls[0][1]["p_harga_jual"]
    assert harga == 150_000_000 and isinstance(harga, int)


def test_harga_berdesimal_ditolak() -> None:
    with pytest.raises(ValidationError):
        _input(harga_jual=1500.5)


async def test_no_hp_dan_email_dikirim_terpisah() -> None:
    db = _Db()
    svc = _svc(db)
    await svc.create(_input(no_hp_pembeli=" 0812-3456-7890 ", email_pembeli=" Budi@Maju.CO.ID "))
    params = db.rpc_calls[0][1]
    assert "p_kontak_pembeli" not in params
    assert params["p_no_hp_pembeli"] == "0812-3456-7890"
    assert params["p_email_pembeli"] == "budi@maju.co.id"


def test_no_hp_dan_email_boleh_kosong() -> None:
    data = _input(no_hp_pembeli="  ", email_pembeli="")
    assert (data.no_hp_pembeli, data.email_pembeli) == (None, None)


@pytest.mark.parametrize(
    "field,nilai",
    [
        ("no_hp_pembeli", "budi@maju.co.id"),
        ("no_hp_pembeli", "0812"),
        ("no_hp_pembeli", "0812abc4567"),
        ("email_pembeli", "081234567890"),
        ("email_pembeli", "budi@maju"),
    ],
)
def test_format_kontak_ditolak(field: str, nilai: str) -> None:
    with pytest.raises(ValidationError):
        _input(**{field: nilai})


@pytest.mark.parametrize(
    "status,job,pesan",
    [
        ("bertugas", None, "sedang bertugas"),
        ("standby", "JOB-7", "sedang bertugas (job JOB-7 belum selesai)"),
        ("perbaikan", None, "sedang perbaikan"),
        ("terjual", None, "sudah terjual"),
    ],
)
def test_alasan_tidak_bisa_dijual(status: str, job: str | None, pesan: str) -> None:
    alasan = alasan_tidak_bisa_dijual("unit", "TR-01", status, job)
    assert alasan is not None and "Tidak bisa menjual unit TR-01" in alasan and pesan in alasan


@pytest.mark.parametrize("status", ["standby", "breakdown", "diafkirkan"])
def test_unit_boleh_dijual(status: str) -> None:
    assert alasan_tidak_bisa_dijual("unit", "TR-01", status, None) is None


def test_pesan_unit_trailer() -> None:
    assert alasan_tidak_bisa_dijual("unit_trailer", "TL-1", "perbaikan", None) == (
        "Tidak bisa menjual unit trailer TL-1 karena unit trailer sedang perbaikan."
    )


async def test_simpan_ditolak_bila_aset_tidak_bisa_dijual() -> None:
    from app.core.errors import ValidationError as AppValidationError

    db = _Db()
    svc = PenjualanUnitService.__new__(PenjualanUnitService)
    svc._db = db  # type: ignore[assignment]

    async def tolak(*_: object) -> None:
        raise AppValidationError("Tidak bisa menjual unit TR-01 karena unit sedang perbaikan.")

    svc._cek_boleh_dijual = tolak  # type: ignore[method-assign]
    with pytest.raises(AppValidationError, match="perbaikan"):
        await svc.create(_input())
    assert db.rpc_calls == []


async def test_penyerah_ikut_dikirim_saat_catat() -> None:
    db = _Db()
    await _svc(db).create(_input(penyerah_nama="Budi", penyerah_jabatan="Kepala Pool"))
    params = db.rpc_calls[0][1]
    assert (params["p_penyerah_nama"], params["p_penyerah_jabatan"]) == ("Budi", "Kepala Pool")


async def test_edit_penjualan_lewat_fungsi_db() -> None:
    from app.modules.penjualan_unit.schemas import PenjualanUnitUbah

    db = _Db()
    ubah = PenjualanUnitUbah(nama_pembeli="PT Baru", harga_jual=200_000_000, tanggal_jual="2026-09-27")
    await _svc(db).update("p1", ubah)
    nama, params = db.rpc_calls[0]
    assert nama == "ubah_penjualan_unit"
    assert params["p_id"] == "p1" and params["p_harga_jual"] == 200_000_000
