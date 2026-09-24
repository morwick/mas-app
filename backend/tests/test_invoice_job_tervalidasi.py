"""Tagihan hanya boleh berisi job yang sudah divalidasi admin."""

from types import SimpleNamespace
from typing import Any

from app.modules.invoices.service import InvoiceService


class _Rekam:
    def __init__(self) -> None:
        self.filter: list[tuple[str, ...]] = []
        self.tabel = ""

    @property
    def not_(self) -> "_Rekam":
        self.filter.append(("not",))
        return self

    def table(self, nama: str) -> "_Rekam":
        self.tabel = nama
        return self

    def select(self, *_: object, **__: object) -> "_Rekam":
        return self

    def eq(self, col: str, val: Any) -> "_Rekam":
        self.filter.append(("eq", col, val))
        return self

    def is_(self, col: str, val: Any) -> "_Rekam":
        self.filter.append(("is", col, val))
        return self

    def order(self, *_: object, **__: object) -> "_Rekam":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[])


async def test_pilihan_job_hanya_yang_sudah_divalidasi() -> None:
    db = _Rekam()
    await InvoiceService(db).jobs_belum_ditagih()  # type: ignore[arg-type]
    assert ("eq", "status_job", "selesai") in db.filter
    i = db.filter.index(("is", "validated_at", "null"))
    assert db.filter[i - 1] == ("not",)
