"""Uang jalan: tambah hanya selama job belum ditagih; pencairan dari
pengajuan driver tidak bisa diubah / dihapus."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.uang_jalan.schemas import UangJalanInput
from app.modules.uang_jalan.service import UangJalanService


class _Db:
    def __init__(self, data: Any) -> None:
        self.data = data
        self.ditulis = False

    def table(self, *_: object) -> "_Db":
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def update(self, *_: object, **__: object) -> "_Db":
        self.ditulis = True
        return self

    def insert(self, *_: object, **__: object) -> "_Db":
        self.ditulis = True
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    def neq(self, *_: object) -> "_Db":
        return self

    def limit(self, *_: object) -> "_Db":
        return self

    def maybe_single(self) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


async def test_tambah_uang_jalan_ditolak_bila_job_sudah_ditagih() -> None:
    db = _Db([{"invoice": {"invoice_number": "0001/INV"}}])
    payload = UangJalanInput(job_id="j1", jenis="penambahan_pagu", tanggal="2026-09-26", jumlah=100_000)
    with pytest.raises(ValidationError, match="sudah ditagihkan di tagihan 0001/INV"):
        await UangJalanService(db).create(payload, created_by="u")  # type: ignore[arg-type]
    assert not db.ditulis


@pytest.mark.parametrize("aksi", ["hapus", "ubah"])
async def test_uang_jalan_dari_pengajuan_driver_terkunci(aksi: str) -> None:
    db = _Db({"request_id": "req-1"})
    svc = UangJalanService(db)  # type: ignore[arg-type]
    with pytest.raises(ValidationError, match="pengajuan driver"):
        if aksi == "hapus":
            await svc.delete("uj-1")
        else:
            payload = UangJalanInput(job_id="j1", jenis="penambahan_pagu", tanggal="2026-09-26", jumlah=100_000)
            await svc.update("uj-1", payload)
    assert not db.ditulis
