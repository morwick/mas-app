"""Proyek hanya bisa ditagih bila semua job-nya (selain yang batal) selesai."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.invoices.service import InvoiceService


class _Db:
    """Tabel jobs palsu: mengembalikan baris yang sama untuk setiap query."""

    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data

    def table(self, _: str) -> "_Db":
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def in_(self, *_: object) -> "_Db":
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    def neq(self, *_: object) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


async def test_job_per_proyek_hitung_jumlah_dan_yang_belum_selesai() -> None:
    db = _Db(
        [
            {"job_number": "J1", "proyek_id": "p1", "status_job": "selesai"},
            {"job_number": "J2", "proyek_id": "p1", "status_job": "dalam_perjalanan"},
            {"job_number": "J3", "proyek_id": "p2", "status_job": "selesai"},
        ]
    )
    hasil = await InvoiceService(db)._job_per_proyek({"p1", "p2"})  # type: ignore[arg-type]
    assert hasil == {"p1": (2, ["J2"]), "p2": (1, [])}


async def test_tagihan_ditolak_bila_ada_job_proyek_belum_selesai(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _Db([{"proyek_id": "p1", "proyek": {"nomor_proyek": "001/PRJ"}}])

    async def job_per_proyek(self: InvoiceService, ids: set[str]) -> dict[str, tuple[int, list[str]]]:
        return {"p1": (2, ["JOB-2"])}

    monkeypatch.setattr(InvoiceService, "_job_per_proyek", job_per_proyek)
    with pytest.raises(ValidationError, match="001/PRJ belum bisa ditagih: job JOB-2 belum selesai"):
        await InvoiceService(db)._cek_proyek_semua_selesai(["j1"])  # type: ignore[arg-type]


async def test_tagihan_lolos_bila_semua_job_proyek_selesai(monkeypatch: pytest.MonkeyPatch) -> None:
    db = _Db([{"proyek_id": "p1", "proyek": {"nomor_proyek": "001/PRJ"}}])

    async def job_per_proyek(self: InvoiceService, ids: set[str]) -> dict[str, tuple[int, list[str]]]:
        return {"p1": (2, [])}

    monkeypatch.setattr(InvoiceService, "_job_per_proyek", job_per_proyek)
    await InvoiceService(db)._cek_proyek_semua_selesai(["j1"])  # type: ignore[arg-type]
