"""Daftar & detail job membawa status tagihan dan status bayarnya."""

from types import SimpleNamespace
from typing import Any

from app.modules.jobs.schemas import Job
from app.modules.jobs.service import JobService


class _Db:
    def __init__(self, data: list[dict[str, Any]]) -> None:
        self.data = data

    def table(self, *_: object) -> "_Db":
        return self

    def select(self, *_: object, **__: object) -> "_Db":
        return self

    def in_(self, *_: object) -> "_Db":
        return self

    def eq(self, *_: object) -> "_Db":
        return self

    def neq(self, *_: object) -> "_Db":
        return self

    async def execute(self) -> SimpleNamespace:
        return SimpleNamespace(data=self.data)


def _job(job_id: str) -> Job:
    return Job(
        id=job_id,
        job_number=f"JOB-{job_id}",
        share_token="t",
        customer_id="c",
        customer_nama="PT A",
        alat_diangkut="Excavator",
        asal="A",
        tujuan="B",
        unit_id="u",
        driver_id="d",
        etd="2026-09-01T00:00:00Z",
        status="selesai",
        created_at="2026-09-01T00:00:00Z",
    )


async def test_info_tagihan_terlampir() -> None:
    db = _Db(
        [
            {
                "job_id": "1",
                "invoice": {
                    "id": "inv-1",
                    "invoice_number": "0001/INV",
                    "total": 1_000_000,
                    "dibayar": 400_000,
                    "status_tagihan": "terkirim",
                    "jatuh_tempo": None,
                },
            }
        ]
    )
    jobs = await JobService(db)._lampirkan_tagihan([_job("1"), _job("2")])  # type: ignore[arg-type]
    assert jobs[0].invoice_number == "0001/INV"
    assert jobs[0].invoice_status_bayar == "partial_paid"
    assert jobs[1].invoice_id is None  # belum ditagihkan
    assert all(j.info_tagihan for j in jobs)
    assert jobs[0].invoice_sisa is None  # admin: tanpa nominal


async def test_superadmin_menerima_info_lengkap() -> None:
    db = _Db(
        [
            {
                "job_id": "1",
                "invoice": {
                    "id": "inv-1",
                    "invoice_number": "0001/INV",
                    "total": 1_000_000,
                    "dibayar": 400_000,
                    "status_tagihan": "terkirim",
                    "jatuh_tempo": None,
                },
            }
        ]
    )
    jobs = await JobService(db)._lampirkan_tagihan([_job("1")], lengkap=True)  # type: ignore[arg-type]
    assert jobs[0].invoice_sisa == 600_000
    assert jobs[0].invoice_status_tampil == "terkirim"


class _DbJob(_Db):
    """Hanya tabel jobs; menyentuh invoice_items berarti info tagihan bocor."""

    def table(self, nama: str) -> "_DbJob":
        assert nama == "jobs", "info tagihan tidak boleh diambil untuk operator"
        return self

    def maybe_single(self) -> "_DbJob":
        return self


async def test_operator_tidak_menerima_info_tagihan() -> None:
    row = {
        "id": "1",
        "job_number": "JOB-1",
        "share_token": "t",
        "customer_id": "c",
        "alat_diangkut": "Excavator",
        "asal": "A",
        "tujuan": "B",
        "unit_id": "u",
        "driver_id": "d",
        "etd": "2026-09-01T00:00:00Z",
        "status_job": "selesai",
        "created_at": "2026-09-01T00:00:00Z",
        "customers": {"nama": "PT A"},
    }
    db = _DbJob(row)  # type: ignore[arg-type]
    job = await JobService(db).get("1")  # type: ignore[arg-type]
    assert job.info_tagihan is False
    assert job.invoice_number is None


def test_finance_tidak_bisa_mengubah_job() -> None:
    import pytest

    from app.core.auth import AuthContext, CurrentUser
    from app.core.errors import ForbiddenError
    from app.modules.jobs.router import _bukan_finance

    def ctx(role: str) -> AuthContext:
        user = CurrentUser(id="u", email="e", nama="N", initials="N", role=role, allowed_jenis_unit_ids=None)  # type: ignore[arg-type]
        return AuthContext(user=user, token="t")

    with pytest.raises(ForbiddenError):
        _bukan_finance(ctx("finance"))
    _bukan_finance(ctx("admin"))
