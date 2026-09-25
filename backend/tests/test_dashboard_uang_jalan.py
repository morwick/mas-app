"""Dashboard: job yang belum dikonfirmasi driver, dan pengajuan uang jalan menunggu."""

import asyncio
from types import SimpleNamespace
from typing import Any

from app.modules.dashboard.router import _jobs_belum_konfirmasi


class _FakeQuery:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self._data = data
        self.filters: list[tuple[str, Any]] = []

    def select(self, *_: object) -> "_FakeQuery":
        return self

    def in_(self, col: str, val: Any) -> "_FakeQuery":
        self.filters.append((col, val))
        return self

    def eq(self, col: str, val: Any) -> "_FakeQuery":
        self.filters.append((col, val))
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self._data)


class _FakeClient:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.query = _FakeQuery(data)

    def table(self, _: str) -> _FakeQuery:
        return self.query


def _job(id_: str, **kwargs: Any) -> dict[str, Any]:
    return {
        "id": id_,
        "job_number": f"JOB-{id_}",
        "customer": {"nama_perusahaan": "PT Contoh"},
        "driver": {"nama": "Budi"},
        **kwargs,
    }


def _cari(jobs: list[dict[str, Any]]) -> tuple[list[Any], _FakeClient]:
    client = _FakeClient(jobs)
    return asyncio.run(_jobs_belum_konfirmasi(client)), client  # type: ignore[arg-type]


def test_job_ditugaskan_muncul_dengan_nama_customer_dan_driver() -> None:
    hasil, _ = _cari([_job("a"), _job("b", driver={"nama": "Sari"})])
    assert len(hasil) == 2
    assert hasil[0].job_number == "JOB-a"
    assert hasil[0].customer_nama == "PT Contoh"
    assert hasil[0].driver_nama == "Budi"
    assert hasil[1].driver_nama == "Sari"


def test_hanya_filter_status_ditugaskan() -> None:
    _, client = _cari([])
    assert ("status_job", "ditugaskan") in client.query.filters


class _RekamQuery:
    def __init__(self) -> None:
        self.filter: list[tuple[str, str, Any]] = []
        self.select_str = ""

    def table(self, _: str) -> "_RekamQuery":
        return self

    def select(self, s: str, **_: object) -> "_RekamQuery":
        self.select_str = s
        return self

    def eq(self, col: str, val: Any) -> "_RekamQuery":
        self.filter.append(("eq", col, val))
        return self

    def neq(self, col: str, val: Any) -> "_RekamQuery":
        self.filter.append(("neq", col, val))
        return self

    def order(self, *_: object, **__: object) -> "_RekamQuery":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=[], count=0)


async def test_pengajuan_dari_job_dibatalkan_tidak_ditampilkan() -> None:
    from app.modules.dashboard.router import _count_pending_requests
    from app.modules.uang_jalan.service import UangJalanService

    for jalankan in (
        lambda db: UangJalanService(db).list_pending_requests(),
        lambda db: _count_pending_requests(db),
    ):
        db = _RekamQuery()
        await jalankan(db)
        assert "!inner(status_job)" in db.select_str
        assert any(f[0] == "neq" and f[1].endswith(".status_job") and f[2] == "cancelled" for f in db.filter)
