"""Dashboard: hitungan job yang uang jalannya belum ditransfer admin."""

import asyncio
from types import SimpleNamespace
from typing import Any

from app.modules.dashboard.router import _count_belum_transfer


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


def _hitung(jobs: list[dict[str, Any]]) -> tuple[int, _FakeClient]:
    client = _FakeClient(jobs)
    return asyncio.run(_count_belum_transfer(client)), client  # type: ignore[arg-type]


def test_job_tanpa_pencairan_berbukti_dihitung() -> None:
    n, _ = _hitung(
        [
            {"id": "a", "uang_jalan": [], "uang_jalan_requests": []},
            # penambahan pagu bukan pencairan — driver tetap terkunci
            {"id": "b", "uang_jalan": [{"jenis": "penambahan_pagu", "bukti_transfer_path": None}]},
        ]
    )
    assert n == 2


def test_job_sudah_ditransfer_tidak_dihitung() -> None:
    n, _ = _hitung([{"id": "a", "uang_jalan": [{"jenis": "pencairan", "bukti_transfer_path": "a/bukti.jpg"}]}])
    assert n == 0


def test_job_dengan_pengajuan_menunggu_tidak_dihitung_dobel() -> None:
    n, _ = _hitung([{"id": "a", "uang_jalan": [], "uang_jalan_requests": [{"status_pengajuan": "diajukan"}]}])
    assert n == 0


def test_hanya_job_sebelum_muat_dan_anak_aktif() -> None:
    _, client = _hitung([])
    assert ("status_job", ["ditugaskan", "diterima"]) in client.query.filters
    assert ("uang_jalan.status", 1) in client.query.filters
    assert ("uang_jalan_requests.status", 1) in client.query.filters


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
