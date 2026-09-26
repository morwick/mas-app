"""Tagihan yang sudah ada pembayaran / faktur pajak tidak boleh diedit & dihapus."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.invoices.service import InvoiceService, alasan_terkunci


class _Db:
    def __init__(self, row: dict[str, Any]) -> None:
        self.row = row
        self.diupdate = False

    def table(self, *_: object) -> "_Db":
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def update(self, *_: object, **__: object) -> "_Db":
        self.diupdate = True
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    def maybe_single(self) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.row)


def test_alasan_terkunci() -> None:
    assert alasan_terkunci(0, None) is None
    assert "pembayaran" in (alasan_terkunci(500_000, None) or "")
    assert "faktur pajak" in (alasan_terkunci(0, "faktur/x.pdf") or "")


@pytest.mark.parametrize(
    "row",
    [{"dibayar": 100_000, "faktur_pajak_path": None}, {"dibayar": 0, "faktur_pajak_path": "faktur/x.pdf"}],
)
async def test_hapus_tagihan_terkunci_ditolak(row: dict[str, Any]) -> None:
    db = _Db(row)
    with pytest.raises(ValidationError, match="tidak bisa diedit atau dihapus"):
        await InvoiceService(db).delete("inv-1")  # type: ignore[arg-type]
    assert not db.diupdate


async def test_hapus_tagihan_bebas_tetap_bisa() -> None:
    db = _Db({"dibayar": 0, "faktur_pajak_path": None})
    await InvoiceService(db).delete("inv-1")  # type: ignore[arg-type]
    assert db.diupdate
