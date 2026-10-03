"""Sales job: pilih dari master, ketik nama baru, atau tanpa sales."""

from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.core.errors import ValidationError
from app.core.transaksi import Transaksi
from app.modules.jobs.schemas import JobUpdate
from app.modules.sales.service import SalesService

MASTER = [
    {"id": "s1", "nama": "Budi Santoso", "no_hp": "081111111111"},
    {"id": "s2", "nama": "Ani", "no_hp": None},
]


class _Db:
    def table(self, *_: object) -> "_Db":
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def order(self, *_: object) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=MASTER)


def _isian(sales_id: str | None = None, nama: str | None = None, no_hp: str | None = None) -> Any:
    return SimpleNamespace(sales_id=sales_id, sales_nama=nama, sales_no_hp=no_hp)


async def _siapkan(*isian: Any) -> tuple[list[str | None], list[dict[str, Any]]]:
    tx = Transaksi(None)  # type: ignore[arg-type]
    hasil = await SalesService(_Db()).siapkan(tx, list(isian), created_by="u1")  # type: ignore[arg-type]
    return hasil, tx._langkah


async def test_tanpa_sales_tidak_menambah_langkah() -> None:
    hasil, langkah = await _siapkan(_isian(), _isian())
    assert hasil == [None, None]
    assert langkah == []


async def test_pilih_dari_daftar() -> None:
    hasil, langkah = await _siapkan(_isian("s1", "Budi Santoso", "081111111111"))
    assert hasil == ["s1"]
    assert langkah == []


async def test_nama_diketik_yang_sudah_ada_memakai_sales_lama() -> None:
    hasil, langkah = await _siapkan(_isian(nama="  budi   SANTOSO "))
    assert hasil == ["s1"]
    assert langkah == []


async def test_nama_baru_dibuat_sekali_untuk_beberapa_job() -> None:
    hasil, langkah = await _siapkan(_isian(nama="Citra"), _isian(nama="citra"))
    assert hasil == ["{{0.id}}", "{{0.id}}"]
    assert langkah == [{"op": "insert", "tabel": "sales", "data": {"nama": "Citra", "no_hp": None, "created_by": "u1"}}]


async def test_no_hp_diubah_memperbarui_master() -> None:
    hasil, langkah = await _siapkan(_isian("s2", "Ani", "082222222222"))
    assert hasil == ["s2"]
    assert langkah == [
        {"op": "update", "tabel": "sales", "data": {"no_hp": "082222222222"}, "filter": {"id": "s2"}, "wajib": True}
    ]


async def test_sales_terhapus_ditolak() -> None:
    with pytest.raises(ValidationError, match="Sales yang dipilih tidak ditemukan"):
        await _siapkan(_isian("s9"))


def test_format_no_hp_sales_divalidasi() -> None:
    with pytest.raises(PydanticValidationError, match="No HP sales"):
        JobUpdate(sales_nama="Citra", sales_no_hp="12345")
    assert JobUpdate(sales_nama=" ", sales_no_hp="").sales_nama is None
