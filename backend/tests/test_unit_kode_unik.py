"""Kode unit unik: unit yang sedang diubah dikecualikan; unit lain (termasuk
nonaktif / terjual yang tidak tampil di daftar) disebut di pesan."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ConflictError
from app.modules.units.service import UnitService


class _Db:
    """Tabel units berisi `data`; filter eq/neq diterapkan sungguhan."""

    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data
        self.hasil = data

    def table(self, *_: object) -> "_Db":
        self.hasil = list(self.data)
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def eq(self, kolom: str, nilai: Any) -> "_Db":
        self.hasil = [r for r in self.hasil if r.get(kolom) == nilai]
        return self

    def neq(self, kolom: str, nilai: Any) -> "_Db":
        self.hasil = [r for r in self.hasil if r.get(kolom) != nilai]
        return self

    def limit(self, n: int) -> "_Db":
        self.hasil = self.hasil[:n]
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.hasil)


UNITS = [
    {"id": "u1", "kode_unit": "TH01", "is_active": True, "status_operasional": "standby"},
    {"id": "u2", "kode_unit": "TH02", "is_active": False, "status_operasional": "standby"},
    {"id": "u3", "kode_unit": "TH03", "is_active": True, "status_operasional": "terjual"},
]


async def test_kode_milik_unit_itu_sendiri_boleh() -> None:
    await UnitService(_Db(UNITS))._pastikan_kode_unik("TH01", kecuali_id="u1")  # type: ignore[arg-type]


async def test_kode_baru_boleh() -> None:
    await UnitService(_Db(UNITS))._pastikan_kode_unik("TH99", kecuali_id="u1")  # type: ignore[arg-type]


async def test_kode_unit_aktif_lain_ditolak() -> None:
    with pytest.raises(ConflictError, match=r"Kode unit TH01 sudah dipakai unit lain\.$"):
        await UnitService(_Db(UNITS))._pastikan_kode_unik("TH01", kecuali_id="u2")  # type: ignore[arg-type]


async def test_kode_unit_nonaktif_disebut() -> None:
    with pytest.raises(ConflictError, match="unit nonaktif"):
        await UnitService(_Db(UNITS))._pastikan_kode_unik("TH02", kecuali_id="u1")  # type: ignore[arg-type]


async def test_kode_unit_terjual_disebut() -> None:
    with pytest.raises(ConflictError, match="unit terjual"):
        await UnitService(_Db(UNITS))._pastikan_kode_unik("TH03")  # type: ignore[arg-type]
