"""No polisi unit tidak boleh duplikat (tambah & edit), tanpa beda spasi /
huruf besar-kecil; unit yang sedang diedit dikecualikan."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ConflictError
from app.modules.units.service import UnitService, kunci_no_polisi


class _Db:
    def __init__(self, units: list[dict[str, Any]]) -> None:
        self.units = units
        self.kecuali: str | None = None

    def table(self, _: str) -> "_Db":
        self.kecuali = None
        return self

    def select(self, *_: object) -> "_Db":
        return self

    def neq(self, kolom: str, nilai: str) -> "_Db":
        if kolom == "id":
            self.kecuali = nilai
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[u for u in self.units if u["id"] != self.kecuali])


UNITS = [{"id": "u1", "kode_unit": "LB-01", "no_polisi": "BM 1234 XY"}]


def _svc() -> UnitService:
    return UnitService(_Db(UNITS))  # type: ignore[arg-type]


def test_kunci_abaikan_spasi_dan_huruf() -> None:
    assert kunci_no_polisi(" bm  1234 xy ") == kunci_no_polisi("BM1234XY") == "BM1234XY"


@pytest.mark.parametrize("no_polisi", ["BM 1234 XY", "bm1234xy", "  Bm 1234  Xy "])
async def test_no_polisi_kembar_ditolak(no_polisi: str) -> None:
    with pytest.raises(ConflictError, match="sudah dipakai unit LB-01"):
        await _svc()._pastikan_no_polisi_unik(no_polisi)


async def test_no_polisi_baru_lolos() -> None:
    await _svc()._pastikan_no_polisi_unik("BM 9999 ZZ")


async def test_edit_unit_sendiri_tidak_dianggap_kembar() -> None:
    await _svc()._pastikan_no_polisi_unik("BM 1234 XY", kecuali_id="u1")
