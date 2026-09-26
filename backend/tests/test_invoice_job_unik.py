"""Satu job hanya boleh ditagihkan satu kali."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.invoices.schemas import InvoiceInput, InvoiceItemInput
from app.modules.invoices.service import InvoiceService, _validate


def _payload(*job_ids: str | None) -> InvoiceInput:
    return InvoiceInput(
        customer_id="c1",
        kota_terbit="Jakarta",
        tanggal="2026-09-26",
        items=[InvoiceItemInput(job_id=j, deskripsi="Angkut", qty=1, harga_satuan=1000) for j in job_ids],
    )


class _Db:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data

    def table(self, *_: object) -> "_Db":
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


def test_job_ganda_dalam_satu_form_ditolak() -> None:
    with pytest.raises(ValidationError, match="Baris 3: job ini sudah dipilih di baris 1"):
        _validate(_payload("j1", "j2", "j1"))


def test_baris_tanpa_job_boleh_lebih_dari_satu() -> None:
    _validate(_payload(None, None, "j1"))


async def test_job_sudah_ditagih_di_tagihan_lain_ditolak() -> None:
    db = _Db(
        [
            {
                "job_id": "j1",
                "invoice_id": "inv-lama",
                "job": {"job_number": "JOB-7"},
                "invoice": {"invoice_number": "0003/INV/MAS/IX/2026", "status_tagihan": "terkirim"},
            }
        ]
    )
    with pytest.raises(ValidationError, match="Job JOB-7 sudah ditagihkan di tagihan 0003/INV/MAS/IX/2026"):
        await InvoiceService(db)._cek_job_belum_ditagih(_payload("j1"))  # type: ignore[arg-type]


async def test_edit_tagihan_sendiri_tidak_dianggap_ganda() -> None:
    db = _Db(
        [
            {
                "job_id": "j1",
                "invoice_id": "inv-ini",
                "job": {"job_number": "JOB-7"},
                "invoice": {"invoice_number": "0003", "status_tagihan": "draft"},
            }
        ]
    )
    await InvoiceService(db)._cek_job_belum_ditagih(_payload("j1"), kecuali_invoice="inv-ini")  # type: ignore[arg-type]
