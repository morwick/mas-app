"""Link tracking customer: selesai saat unloading tuntas, berlaku 24 jam sesudahnya.

Batas 24 jam ditegakkan RLS (transport.tracking_publik_aktif) — baris yang sudah
lewat tidak pernah sampai ke service. Yang diuji di sini: apa yang dilihat
customer selama link masih berlaku.
"""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import GoneError
from app.modules.tracking.service import PublicTrackingService

JOB: dict[str, Any] = {
    "id": "job-1",
    "job_number": "JOB-2026-020",
    "share_token": "tok",
    "customer_id": "cust-1",
    "unit_id": "unit-1",
    "driver_id": "driver-1",
    "etd": "2026-09-27T01:00:00+00:00",
    "created_at": "2026-09-26T07:00:00+00:00",
    "alat_diangkut": "Excavator",
    "asal": "Gudang A",
    "tujuan": "Proyek B",
    "photos": [
        {
            "id": "p1",
            "type": "unloading",
            "stage": "unloading",
            "slot": "surat_jalan",
            "file_path": "a.jpg",
            "uploaded_at": "2026-09-28T02:00:00+00:00",
        },
        {
            "id": "p2",
            "type": "serah_terima",
            "stage": "serah_terima",
            "slot": "serah_terima",
            "file_path": "b.jpg",
            "uploaded_at": "2026-09-28T05:00:00+00:00",
        },
    ],
}


class _Query:
    def __init__(self, data: Any) -> None:
        self._data = data

    def __getattr__(self, _name: str) -> Any:
        return lambda *a, **k: self

    async def execute(self) -> Any:
        return SimpleNamespace(data=self._data)


class _Db:
    def __init__(self, tables: dict[str, Any]) -> None:
        self._tables = tables

    def table(self, name: str) -> _Query:
        return _Query(self._tables.get(name))


def _svc(job: dict[str, Any] | None) -> PublicTrackingService:
    db = _Db(
        {
            "jobs": job,
            "units": {"id": "unit-1", "kode_unit": "TR-01", "no_polisi": "BM 1", "jenis_unit": {"nama": "Lowbed"}},
            "drivers": {"id": "driver-1", "nama": "Budi", "no_hp": "0812"},
        }
    )
    return PublicTrackingService(db, tracksolid=None)  # type: ignore[arg-type]


async def test_selama_perjalanan_belum_selesai() -> None:
    res = await _svc({**JOB, "status_job": "dalam_perjalanan", "unloading_selesai_at": None}).get("tok")
    assert res.selesai is False
    assert res.berlaku_sampai is None


@pytest.mark.parametrize("status", ["serah_terima_pool", "menunggu_validasi", "selesai"])
async def test_setelah_unloading_tuntas_customer_melihat_selesai(status: str) -> None:
    res = await _svc({**JOB, "status_job": status, "unloading_selesai_at": "2026-09-28T03:00:00+00:00"}).get("tok")
    assert res.selesai is True
    assert res.berlaku_sampai == "2026-09-29T03:00:00.000Z"
    # Foto serah terima di pool (proses internal) tidak ikut tampil.
    assert [p.stage for p in res.job.photos] == ["unloading"]


async def test_link_berakhir_bila_rls_menutup_atau_dibatalkan() -> None:
    with pytest.raises(GoneError):
        await _svc(None).get("tok")
    with pytest.raises(GoneError):
        await _svc({**JOB, "status_job": "cancelled", "unloading_selesai_at": None}).get("tok")


async def test_posisi_truk_tidak_dikirim_setelah_unloading_tuntas() -> None:
    svc = _svc(
        {
            "id": "job-1",
            "status_job": "serah_terima_pool",
            "unloading_selesai_at": "2026-09-28T03:00:00+00:00",
            "unit_id": "unit-1",
            "units": {"imei_gps": "123"},
        }
    )
    with pytest.raises(GoneError):
        await svc.location("tok")


async def test_posisi_truk_tidak_dikirim_bila_job_dibatalkan() -> None:
    svc = _svc(
        {
            "id": "job-1",
            "status_job": "cancelled",
            "unloading_selesai_at": None,
            "unit_id": "unit-1",
            "units": {"imei_gps": "123"},
        }
    )
    with pytest.raises(GoneError, match="berakhir"):
        await svc.location("tok")


async def test_verifikasi_lokasi_hanya_untuk_link_aktif() -> None:
    svc = _svc({"id": "job-1", "status_job": "cancelled", "unloading_selesai_at": None, "units": {"imei_gps": "1"}})
    with pytest.raises(GoneError):
        await svc.verifikasi_ambil("tok")
    with pytest.raises(GoneError):
        await svc.verifikasi_kirim("tok", "c1", "ab12")
