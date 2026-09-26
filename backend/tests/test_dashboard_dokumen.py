"""Dokumen yang habis / habis ≤ 30 hari tampil di "Perlu tindakan" dashboard."""

from datetime import date
from types import SimpleNamespace
from typing import Any

from app.modules.dashboard.dokumen import dokumen_jatuh_tempo


class _Q:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self._data = data

    def __getattr__(self, _: str) -> Any:
        return lambda *a, **k: self

    @property
    def not_(self) -> "_Q":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._data)


class _Db:
    def __init__(self, data: dict[str, list[dict[str, Any]]]) -> None:
        self.data = data

    def table(self, nama: str) -> _Q:
        return _Q(self.data.get(nama, []))


async def test_hanya_yang_habis_atau_segera_habis_urut_paling_mendesak() -> None:
    db = _Db(
        {
            "units": [
                {
                    "id": "u1",
                    "kode_unit": "TR-01",
                    "stnk_berlaku_sampai": "2026-09-20",  # lewat 6 hari
                    "kir_berlaku_sampai": "2026-10-10",  # 14 hari lagi
                    "pajak_berlaku_sampai": "2027-06-01",  # masih lama
                }
            ],
            "unit_trailer": [{"id": "t1", "kode_trailer": "TL-01", "kir_berlaku_sampai": "2026-10-20"}],
            "drivers": [{"id": "d1", "nama": "Andi", "sim_berlaku_sampai": "2026-09-25"}],
        }
    )
    hasil = await dokumen_jatuh_tempo(db, date(2026, 9, 26))  # type: ignore[arg-type]
    assert [(d.label, d.subjek, d.sisa_hari) for d in hasil] == [
        ("STNK", "TR-01", -6),
        ("SIM", "Andi", -1),
        ("KIR", "TR-01", 14),
        ("KIR", "TL-01", 24),
    ]
    assert hasil[0].href == "/units/u1"
