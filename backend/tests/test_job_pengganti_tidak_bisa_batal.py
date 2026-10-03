"""Job pengganti (ganti unit) tidak bisa dibatalkan — lewat batalkan job maupun ubah status."""

from types import SimpleNamespace
from typing import Any

import pytest

from app.core.errors import ValidationError
from app.modules.jobs.schemas import CancelRequest, UpdateStatusRequest
from app.modules.jobs.service import JobService


class _Db:
    """Baca job per id; mencatat bila ada update (yang seharusnya tidak terjadi)."""

    def __init__(self, jobs: dict[str, dict[str, Any]]) -> None:
        self.jobs = jobs
        self._id: str | None = None
        self.diubah = False

    def table(self, *_: object) -> "_Db":
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def update(self, *_: object, **__: object) -> "_Db":
        self.diubah = True
        return self

    def eq(self, kolom: str, nilai: str) -> "_Db":
        if kolom == "id":
            self._id = nilai
        return self

    def maybe_single(self) -> "_Db":
        return self

    def rpc(self, *_: object, **__: object) -> "_Db":
        self.diubah = True
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.jobs.get(self._id or ""))


JOBS = {
    "lama": {"job_number": "JOB-1", "menggantikan_job_id": None},
    "pengganti": {"job_number": "JOB-2", "menggantikan_job_id": "lama"},
}


async def test_batalkan_job_pengganti_ditolak() -> None:
    db = _Db(JOBS)
    with pytest.raises(ValidationError, match="JOB-2 adalah job pengganti .* JOB-1"):
        await JobService(db).cancel("pengganti", CancelRequest(reason="x"))  # type: ignore[arg-type]
    assert not db.diubah


async def test_ubah_status_ke_dibatalkan_ditolak_untuk_job_pengganti() -> None:
    db = _Db(JOBS)
    with pytest.raises(ValidationError, match="tidak bisa dibatalkan"):
        await JobService(db).update_status("pengganti", UpdateStatusRequest(status="cancelled"))  # type: ignore[arg-type]
    assert not db.diubah


async def test_job_biasa_tetap_lolos_pengecekan() -> None:
    await JobService(_Db(JOBS))._tolak_batal_job_pengganti("lama")  # type: ignore[arg-type]
