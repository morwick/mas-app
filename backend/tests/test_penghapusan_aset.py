"""Penghapusan unit & unit trailer: aset jadi Diafkirkan lewat fungsi DB."""

from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError

from app.core.errors import ValidationError as AppValidationError
from app.modules.penghapusan_aset.schemas import BatalkanPenghapusanInput, PenghapusanAsetInput
from app.modules.penghapusan_aset.service import PenghapusanAsetService, alasan_tidak_bisa_dihapus


class _Db:
    def __init__(self) -> None:
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        self.rpc_calls.append((nama, params))
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data="h1")


def _svc(db: _Db, *, tolak: str | None = None) -> PenghapusanAsetService:
    svc = PenghapusanAsetService.__new__(PenghapusanAsetService)
    svc._db = db  # type: ignore[assignment]

    async def cek(*_: object) -> None:
        if tolak:
            raise AppValidationError(tolak)

    svc._cek_boleh_dihapus = cek  # type: ignore[method-assign]
    return svc


def _input(**over: Any) -> PenghapusanAsetInput:
    data: dict[str, Any] = {
        "jenis_aset": "unit",
        "asset_id": "u1",
        "tanggal_hapus": "2026-09-26",
        "alasan": " Rusak berat, tidak ekonomis diperbaiki ",
    }
    return PenghapusanAsetInput(**{**data, **over})


async def test_catat_penghapusan_lewat_fungsi_db() -> None:
    db = _Db()
    assert await _svc(db).create(_input(catatan="Berita acara no. 12")) == "h1"
    assert db.rpc_calls == [
        (
            "catat_penghapusan_aset",
            {
                "p_jenis_aset": "unit",
                "p_asset_id": "u1",
                "p_tanggal_hapus": "2026-09-26",
                "p_alasan": "Rusak berat, tidak ekonomis diperbaiki",
                "p_catatan": "Berita acara no. 12",
            },
        )
    ]


async def test_aset_bertugas_ditolak_sebelum_ke_db() -> None:
    db = _Db()
    with pytest.raises(AppValidationError, match="bertugas"):
        await _svc(db, tolak="Tidak bisa menghapus unit TR-01 karena unit sedang bertugas.").create(_input())
    assert db.rpc_calls == []


def test_alasan_wajib() -> None:
    with pytest.raises(ValidationError):
        _input(alasan="   ")


async def test_batalkan_dengan_alasan_dan_pilihan_insiden() -> None:
    db = _Db()
    payload = BatalkanPenghapusanInput(alasan=" Salah pilih unit ", insiden=[{"id": "i1", "status": "in_progress"}])  # type: ignore[list-item]
    await _svc(db).batalkan("h1", payload)
    assert db.rpc_calls == [
        (
            "batalkan_penghapusan_aset",
            {"p_id": "h1", "p_alasan": "Salah pilih unit", "p_insiden": [{"id": "i1", "status": "in_progress"}]},
        )
    ]


def test_batalkan_wajib_alasan_dan_status_insiden_valid() -> None:
    with pytest.raises(ValidationError):
        BatalkanPenghapusanInput(alasan="  ")
    with pytest.raises(ValidationError):
        BatalkanPenghapusanInput(alasan="x", insiden=[{"id": "i1", "status": "resolved"}])  # type: ignore[list-item]


@pytest.mark.parametrize("status", ["standby", "breakdown", "perbaikan"])
def test_boleh_dihapus(status: str) -> None:
    assert alasan_tidak_bisa_dihapus("unit", "TR-01", status, None) is None


@pytest.mark.parametrize(
    "status,job,pesan",
    [
        ("bertugas", None, "sedang bertugas"),
        ("standby", "JOB-7", "sedang bertugas (job JOB-7 belum selesai)"),
        ("terjual", None, "sudah terjual"),
        ("diafkirkan", None, "sudah diafkirkan"),
    ],
)
def test_tidak_bisa_dihapus(status: str, job: str | None, pesan: str) -> None:
    alasan = alasan_tidak_bisa_dihapus("unit_trailer", "TL-01", status, job)
    assert alasan is not None and "Tidak bisa menghapus unit trailer TL-01" in alasan and pesan in alasan


async def test_edit_penghapusan_lewat_fungsi_db() -> None:
    from app.modules.penghapusan_aset.schemas import PenghapusanAsetUbah

    db = _Db()
    await _svc(db).update("h1", PenghapusanAsetUbah(tanggal_hapus="2026-09-27", alasan=" Rusak "))
    assert db.rpc_calls == [
        (
            "ubah_penghapusan_aset",
            {"p_id": "h1", "p_tanggal_hapus": "2026-09-27", "p_alasan": "Rusak", "p_catatan": None},
        )
    ]
