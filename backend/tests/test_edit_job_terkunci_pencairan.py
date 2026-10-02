"""Edit job: unit, unit trailer, driver terkunci setelah ada pencairan uang jalan."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.jobs.service import JobService


class _Db:
    def __init__(self, job: dict[str, Any] | None) -> None:
        self.job = job

    def table(self, *_: object) -> "_Db":
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    def maybe_single(self) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.job)


JOB = {"unit_id": "u1", "unit_trailer_id": None, "driver_id": "d1"}


async def test_sudah_cair_ganti_driver_ditolak() -> None:
    svc = JobService(_Db({**JOB, "uang_jalan": [{"jenis": "pencairan"}]}))  # type: ignore[arg-type]
    with pytest.raises(ValidationError, match="uang jalan sudah dicairkan"):
        await svc._tolak_ganti_penugasan_bila_sudah_cair("j1", {"driver_id": "d2"})


async def test_sudah_cair_tapi_nilai_sama_boleh() -> None:
    svc = JobService(_Db({**JOB, "uang_jalan": [{"jenis": "pencairan"}]}))  # type: ignore[arg-type]
    sama = {"unit_id": "u1", "driver_id": "d1", "unit_trailer_id": None}
    await svc._tolak_ganti_penugasan_bila_sudah_cair("j1", sama)


async def test_belum_cair_boleh_ganti() -> None:
    svc = JobService(_Db({**JOB, "uang_jalan": []}))  # type: ignore[arg-type]
    await svc._tolak_ganti_penugasan_bila_sudah_cair("j1", {"driver_id": "d2"})
