"""Status unit 'terjual' & 'diafkirkan': ikut dihitung, tapi bukan lagi armada aktif."""

from types import SimpleNamespace
from typing import Any

from app.modules.units.schemas import ChangeStatusRequest
from app.modules.units.service import UnitService


class _Db:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data
        self.filter: list[tuple[str, str, Any]] = []

    def table(self, _: str) -> "_Db":
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def eq(self, col: str, val: Any) -> "_Db":
        self.filter.append(("eq", col, val))
        return self

    @property
    def not_(self) -> "_Db":
        self.filter.append(("not", "", None))
        return self

    def in_(self, col: str, val: Any) -> "_Db":
        self.filter.append(("in", col, tuple(val)))
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data, count=len(self.data))


def test_status_terjual_dan_diafkirkan_diterima() -> None:
    assert ChangeStatusRequest(status="terjual").status == "terjual"
    assert ChangeStatusRequest(status="diafkirkan").status == "diafkirkan"


async def test_hitungan_status_memuat_terjual() -> None:
    db = _Db([{"status_operasional": s} for s in ("standby", "terjual", "terjual", "perbaikan", "diafkirkan")])
    counts = await UnitService(db).status_counts()  # type: ignore[arg-type]
    assert (counts.standby, counts.perbaikan, counts.terjual, counts.diafkirkan) == (1, 1, 2, 1)


async def test_jumlah_armada_tidak_menghitung_unit_terjual() -> None:
    db = _Db([])
    await UnitService(db).count_active()  # type: ignore[arg-type]
    i = db.filter.index(("in", "status_operasional", ("terjual", "diafkirkan")))
    assert db.filter[i - 1][0] == "not"
