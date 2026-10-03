"""Rincian tagihan per proyek: nominal proyek dibagi rata ke job-jobnya."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.invoices.schemas import InvoiceInput, InvoiceItemInput, InvoiceProyekInput
from app.modules.invoices.service import InvoiceService, bagi_rata


class _Db:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self._data = data

    def table(self, _name: str) -> _Db:
        return self

    def select(self, *_a: Any, **_k: Any) -> _Db:
        return self

    def in_(self, *_a: Any) -> _Db:
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._data)


JOBS = [
    {"id": "j1", "job_number": "JOB-1", "proyek_id": "p1", "asal": "A", "tujuan": "B", "alat_diangkut": "Excavator"},
    {"id": "j2", "job_number": "JOB-2", "proyek_id": "p1", "asal": "A", "tujuan": "C", "alat_diangkut": "Dozer"},
    {"id": "j3", "job_number": "JOB-3", "proyek_id": "p2", "asal": "X", "tujuan": "Y", "alat_diangkut": "Crane"},
]


def _payload(proyek: list[InvoiceProyekInput], items: list[InvoiceItemInput] | None = None) -> InvoiceInput:
    return InvoiceInput(
        customer_id="c1", kota_terbit="Pekanbaru", tanggal="2026-10-03", proyek=proyek, items=items or []
    )


def test_bagi_rata_tanpa_selisih() -> None:
    assert bagi_rata(10_000_001, 3) == [3_333_334, 3_333_334, 3_333_333]
    assert sum(bagi_rata(10_000_001, 3)) == 10_000_001
    assert bagi_rata(0, 2) == [0, 0]


async def test_proyek_jadi_baris_per_job_lalu_baris_manual() -> None:
    svc = InvoiceService(_Db(JOBS))  # type: ignore[arg-type]
    manual = InvoiceItemInput(deskripsi="Biaya tambahan", qty=1, harga_satuan=500)
    hasil = await svc._rincian_lengkap(
        _payload(
            [InvoiceProyekInput(proyek_id="p1", uraian="Mobilisasi", nominal=1001, job_ids=["j1", "j2"])], [manual]
        )
    )
    assert [(i.job_id, i.harga_satuan) for i in hasil.items] == [("j1", 501), ("j2", 500), (None, 500)]
    assert hasil.items[0].deskripsi == "Pengangkutan Excavator"


async def test_job_proyek_lain_ditolak() -> None:
    svc = InvoiceService(_Db(JOBS))  # type: ignore[arg-type]
    with pytest.raises(ValidationError, match="bukan bagian"):
        await svc._rincian_lengkap(
            _payload([InvoiceProyekInput(proyek_id="p1", uraian="Mobilisasi", nominal=1000, job_ids=["j3"])])
        )


async def test_proyek_ganda_dan_uraian_kosong_ditolak() -> None:
    svc = InvoiceService(_Db(JOBS))  # type: ignore[arg-type]
    baris = InvoiceProyekInput(proyek_id="p1", uraian="Mobilisasi", nominal=1000, job_ids=["j1"])
    with pytest.raises(ValidationError, match="satu proyek"):
        await svc._rincian_lengkap(_payload([baris, baris]))
    with pytest.raises(ValidationError, match="uraian"):
        await svc._rincian_lengkap(_payload([baris.model_copy(update={"uraian": " "})]))
