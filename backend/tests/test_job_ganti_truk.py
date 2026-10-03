"""Penggantian saat job berjalan: ganti driver, ganti unit trailer, ganti unit
(job pengganti). Masing-masing satu fungsi database + notifikasi driver."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.modules.jobs import service as job_service
from app.modules.jobs.schemas import GantiDriverRequest, GantiTrailerRequest, GantiUnitRequest
from app.modules.jobs.service import JobService


class _Db:
    """Tabel jobs → `job` (job lama) atau `baru` (job pengganti, select ke-2)."""

    def __init__(self, job: dict[str, Any] | None, rpc_hasil: Any = None, baru: dict[str, Any] | None = None) -> None:
        self.job = job
        self.baru = baru
        self.rpc_hasil = rpc_hasil
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []
        self._rpc = False
        self._select_jobs = 0

    def table(self, _: str) -> "_Db":
        self._rpc = False
        self._select_jobs += 1
        return self

    def __getattr__(self, _nama: str) -> Any:
        return lambda *_a, **_k: self

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        self.rpc_calls.append((nama, params))
        self._rpc = True
        return self

    async def execute(self) -> SimpleNamespace:
        if self._rpc:
            return SimpleNamespace(data=self.rpc_hasil)
        return SimpleNamespace(data=self.baru if self._select_jobs > 1 and self.baru else self.job)


@pytest.fixture
def push(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    terkirim: list[tuple[str, str]] = []

    async def fake(driver_id: str, *, title: str, body: str, data: dict[str, str]) -> None:
        terkirim.append((driver_id, title))

    monkeypatch.setattr(job_service, "push_to_driver", fake)
    return terkirim


JOB = {
    "id": "j1",
    "job_number": "JOB-1",
    "driver_id": "d-lama",
    "proyek_id": "pr1",
    "alat_diangkut": "Excavator",
    "asal": "A",
    "tujuan": "B",
    "asal_lat": 0.5,
    "asal_lng": 101.4,
    "tujuan_lat": 1.6,
    "tujuan_lng": 101.4,
    "catatan": "catatan lama",
    "quotation_id": None,
    "quotation_item_id": None,
}
INSIDEN: dict[str, Any] = {
    "insiden_tanggal": "2026-09-26T03:30:00.000Z",
    "insiden_lokasi": "  Tol Cipali KM 120 ",
    "insiden_deskripsi": " Gardan patah ",
}


async def test_ganti_driver_dengan_pengembalian_dan_kasbon(push: list[tuple[str, str]]) -> None:
    db = _Db(JOB)
    req = GantiDriverRequest(
        driver_id="d-baru", alasan=" Supir sakit ", uang_jalan_dikembalikan=300000, sumber_dana_id="kas1", kasbon=200000
    )
    await JobService(db).ganti_driver("j1", req)  # type: ignore[arg-type]
    assert db.rpc_calls == [
        (
            "ganti_driver_job",
            {
                "p_job_id": "j1",
                "p_driver_baru_id": "d-baru",
                "p_alasan": "Supir sakit",
                "p_dikembalikan": 300000,
                "p_sumber_dana_id": "kas1",
                "p_kasbon": 200000,
            },
        )
    ]
    assert [p[0] for p in push] == ["d-baru", "d-lama"]


def test_pengembalian_wajib_menyebut_kas() -> None:
    with pytest.raises(ValueError, match="Pilih kas"):
        GantiDriverRequest(driver_id="d-baru", alasan="Kabur", uang_jalan_dikembalikan=1000)


def test_alasan_wajib() -> None:
    with pytest.raises(ValueError):
        GantiDriverRequest(driver_id="d-baru", alasan="   ")


async def test_ganti_trailer_mencatat_insiden(push: list[tuple[str, str]]) -> None:
    db = _Db(JOB)
    await JobService(db).ganti_trailer(  # type: ignore[arg-type]
        "j1", GantiTrailerRequest(unit_trailer_id="t2", alasan="Ban trailer pecah", **INSIDEN)
    )
    nama, params = db.rpc_calls[0]
    assert nama == "ganti_trailer_job"
    assert params["p_trailer_baru_id"] == "t2"
    assert params["p_insiden_lokasi"] == "Tol Cipali KM 120"
    assert params["p_insiden_deskripsi"] == "Gardan patah"
    assert push == [("d-lama", "Unit trailer job Anda diganti")]


def test_deskripsi_insiden_wajib() -> None:
    with pytest.raises(ValueError):
        GantiTrailerRequest(unit_trailer_id="t2", alasan="Rusak", **{**INSIDEN, "insiden_deskripsi": "  "})


async def test_ganti_unit_membuat_job_pengganti(monkeypatch: pytest.MonkeyPatch, push: list[tuple[str, str]]) -> None:
    disiapkan: dict[str, Any] = {}

    async def siapkan(self: JobService, payload: Any, *, created_by: str | None, kecuali_job_id: str | None) -> Any:
        disiapkan.update(payload=payload, kecuali=kecuali_job_id)
        return {"unit_id": payload.unit_id, "driver_id": payload.driver_id, "etd": "2099-01-01T01:00:00+00:00"}

    async def kabari(self: JobService, row: dict[str, Any], payload: Any) -> None:
        push.append((payload.driver_id, "Job baru untuk Anda"))

    monkeypatch.setattr(JobService, "siapkan_baris", siapkan)
    monkeypatch.setattr(JobService, "kabari_driver", kabari)
    db = _Db(JOB, rpc_hasil="j2", baru={"id": "j2", "job_number": "JOB-2", "share_token": "tok"})
    req = GantiUnitRequest(
        unit_id="u2",
        driver_id="d-baru",
        etd="2099-01-01T08:00",
        uang_jalan_awal=1500000,
        alasan="Unit rusak",
        kasbon=50000,
        **INSIDEN,
    )

    hasil = await JobService(db).ganti_unit("j1", req, created_by="p1")  # type: ignore[arg-type]

    # Job pengganti memakai rute & proyek job lama; job lama tidak dihitung bentrok.
    assert disiapkan["kecuali"] == "j1"
    assert disiapkan["payload"].proyek_id == "pr1"
    assert disiapkan["payload"].asal == "A" and disiapkan["payload"].catatan == "catatan lama"
    nama, params = db.rpc_calls[0]
    assert nama == "ganti_unit_job_baru"
    assert params["p_job_baru"]["unit_id"] == "u2"
    assert params["p_kasbon"] == 50000 and params["p_dikembalikan"] == 0
    assert hasil.job_number == "JOB-2"
    assert push == [("d-baru", "Job baru untuk Anda"), ("d-lama", "Job ditutup — unit diganti")]


async def test_ganti_unit_etd_lebih_awal_dari_job_awal_ditolak() -> None:
    from app.core.errors import ValidationError

    db = _Db({**JOB, "job_number": "JOB-1", "etd": "2099-01-05T01:00:00+00:00"})
    req = GantiUnitRequest(
        unit_id="u2",
        driver_id="d-baru",
        etd="2099-01-04T08:00:00+07:00",
        uang_jalan_awal=1500000,
        alasan="Unit rusak",
        **INSIDEN,
    )
    with pytest.raises(ValidationError, match="tidak boleh lebih awal dari ETD job awal JOB-1"):
        await JobService(db).ganti_unit("j1", req, created_by="p1")  # type: ignore[arg-type]
    assert db.rpc_calls == []
