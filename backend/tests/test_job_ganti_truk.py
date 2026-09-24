"""Ganti truk pada job: satu fungsi database + notifikasi driver."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.modules.jobs import service as job_service
from app.modules.jobs.schemas import GantiTrukRequest
from app.modules.jobs.service import JobService


class _Db:
    def __init__(self, job: dict[str, Any] | None) -> None:
        self.job = job
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []
        self._rpc = False

    def table(self, _: str) -> "_Db":
        self._rpc = False
        return self

    def select(self, *_: object) -> "_Db":
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    def maybe_single(self) -> "_Db":
        return self

    def rpc(self, nama: str, params: dict[str, Any]) -> "_Db":
        self.rpc_calls.append((nama, params))
        self._rpc = True
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=None if self._rpc else self.job)


@pytest.fixture
def push(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, str]]:
    terkirim: list[tuple[str, str]] = []

    async def fake(driver_id: str, *, title: str, body: str, data: dict[str, str]) -> None:
        terkirim.append((driver_id, title))

    monkeypatch.setattr(job_service, "push_to_driver", fake)
    return terkirim


JOB = {"driver_id": "d-lama", "job_number": "JOB-1", "asal": "A", "tujuan": "B"}


async def test_ganti_truk_dan_driver(push: list[tuple[str, str]]) -> None:
    db = _Db(JOB)
    await JobService(db).ganti_truk(  # type: ignore[arg-type]
        "j1", GantiTrukRequest(unit_id="u2", alasan=" Ban pecah ", driver_id="d-baru", unit_trailer_id="t1")
    )
    assert db.rpc_calls == [
        (
            "ganti_unit_job",
            {
                "p_job_id": "j1",
                "p_unit_baru_id": "u2",
                "p_alasan": "Ban pecah",
                "p_driver_baru_id": "d-baru",
                "p_unit_trailer_baru_id": "t1",
            },
        )
    ]
    assert [p[0] for p in push] == ["d-baru", "d-lama"]


async def test_ganti_truk_driver_tetap(push: list[tuple[str, str]]) -> None:
    db = _Db(JOB)
    await JobService(db).ganti_truk("j1", GantiTrukRequest(unit_id="u2", alasan="Mogok"))  # type: ignore[arg-type]
    assert db.rpc_calls[0][1]["p_driver_baru_id"] is None
    assert push == [("d-lama", "Truk job Anda diganti")]


def test_alasan_wajib() -> None:
    with pytest.raises(ValueError):
        GantiTrukRequest(unit_id="u2", alasan="   ")
