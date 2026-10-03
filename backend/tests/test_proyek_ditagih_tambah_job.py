"""Proyek yang sudah masuk tagihan aktif tidak bisa ditambah job; tagihan
dibatalkan → boleh lagi (query hanya menghitung tagihan yang tidak batal)."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.jobs.service import JobService
from app.modules.proyek.schemas import ProyekUpdate
from app.modules.proyek.service import ProyekService


class _Db:
    """Data per tabel; mencatat filter supaya terlihat tagihan batal disaring."""

    def __init__(self, data: dict[str, list[dict[str, Any]]]) -> None:
        self.data = data
        self.filter: list[tuple[str, str, Any]] = []
        self._tabel = ""

    def table(self, nama: str) -> "_Db":
        self._tabel = nama
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def eq(self, kolom: str, nilai: Any) -> "_Db":
        self.filter.append(("eq", kolom, nilai))
        return self

    def neq(self, kolom: str, nilai: Any) -> "_Db":
        self.filter.append(("neq", kolom, nilai))
        return self

    def in_(self, kolom: str, nilai: Any) -> "_Db":
        self.filter.append(("in", kolom, nilai))
        return self

    def order(self, *_: object, **__: object) -> "_Db":
        return self

    def limit(self, *_: object) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data.get(self._tabel, []))


DITAGIH = {"invoice_items": [{"invoice": {"invoice_number": "INV-001"}, "job": {"proyek_id": "p1"}}]}


async def test_proyek_ditagih_ditolak() -> None:
    db = _Db(DITAGIH)
    with pytest.raises(ValidationError, match="sudah masuk tagihan INV-001"):
        await JobService(db).tolak_bila_proyek_ditagih("p1")  # type: ignore[arg-type]
    assert ("neq", "invoice.status_tagihan", "batal") in db.filter


async def test_proyek_tanpa_tagihan_aktif_boleh() -> None:
    # Tagihan batal tidak ikut terbaca (disaring query) → tidak ada baris.
    await JobService(_Db({})).tolak_bila_proyek_ditagih("p1")  # type: ignore[arg-type]


async def test_edit_proyek_dengan_job_baru_ditolak_bila_ditagih() -> None:
    svc = ProyekService(_Db(DITAGIH))  # type: ignore[arg-type]
    job = {
        "alat_diangkut": "Excavator",
        "asal": "A",
        "tujuan": "B",
        "unit_id": "u1",
        "driver_id": "d1",
        "etd": "2099-01-01T08:00:00+07:00",
        "uang_jalan_awal": 1000000,
    }
    with pytest.raises(ValidationError, match="tidak bisa menambah job"):
        await svc.update("p1", ProyekUpdate(jobs_baru=[job]), created_by="u1")  # type: ignore[list-item]


async def test_gabung_proyek_melewati_proyek_yang_ditagih() -> None:
    db = _Db(
        {
            "jobs": [
                {"proyek": {"id": "p1", "nomor_proyek": "001"}},
                {"proyek": {"id": "p0", "nomor_proyek": "000"}},
            ],
            **DITAGIH,
        }
    )
    hasil = await ProyekService(db).cari_untuk_penawaran("q1", "u1")  # type: ignore[arg-type]
    assert hasil is not None and hasil.id == "p0"
