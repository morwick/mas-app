"""Deteksi bentrok jadwal — fungsi murni, tidak menyentuh database.

Dipakai service job untuk defense-in-depth; frontend punya salinan logika yang
sama untuk peringatan real-time saat admin mengisi form.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel

from app.core.timeutil import parse_iso

# Semua status yang belum ditutup — job aktif menahan unit & driver (BR-01).
ACTIVE_JOB_STATUSES: tuple[str, ...] = (
    "ditugaskan",
    "diterima",
    "loading",
    "dalam_perjalanan",
    "unloading",
    "serah_terima_pool",
    "menunggu_validasi",
)

# ETA fallback bila job tidak mengisi ETA.
ETA_FALLBACK_HOURS = 12

ConflictReason = Literal["unit", "driver", "both"]


class JobConflict(BaseModel):
    job_id: str
    job_number: str
    customer_nama: str
    etd: str
    eta: str | None
    status: str
    reason: ConflictReason


class ConflictCheckResult(BaseModel):
    unit: list[JobConflict]
    driver: list[JobConflict]
    has_any: bool


class ConflictCandidate(BaseModel):
    unit_id: str
    driver_id: str
    etd: str
    eta: str | None = None
    exclude_job_id: str | None = None


class ScheduledJob(BaseModel):
    """Subset job yang dibutuhkan pemeriksaan bentrok."""

    id: str
    job_number: str
    customer_nama: str
    unit_id: str
    driver_id: str
    etd: str
    eta: str | None
    status: str


def _effective_end(etd: str, eta: str | None) -> datetime:
    if eta:
        return parse_iso(eta)
    return parse_iso(etd) + timedelta(hours=ETA_FALLBACK_HOURS)


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and a_end > b_start


def find_job_conflicts(candidate: ConflictCandidate, active_jobs: list[ScheduledJob]) -> ConflictCheckResult:
    """Job aktif yang bentrok: jendela waktu beririsan DAN unit atau driver sama."""
    if not candidate.unit_id or not candidate.driver_id or not candidate.etd:
        return ConflictCheckResult(unit=[], driver=[], has_any=False)

    cand_start = parse_iso(candidate.etd)
    cand_end = _effective_end(candidate.etd, candidate.eta)

    unit: list[JobConflict] = []
    driver: list[JobConflict] = []

    for job in active_jobs:
        if candidate.exclude_job_id and job.id == candidate.exclude_job_id:
            continue
        if job.status not in ACTIVE_JOB_STATUSES:
            continue

        same_unit = job.unit_id == candidate.unit_id
        same_driver = job.driver_id == candidate.driver_id
        if not same_unit and not same_driver:
            continue

        if not _overlaps(cand_start, cand_end, parse_iso(job.etd), _effective_end(job.etd, job.eta)):
            continue

        reason: ConflictReason = "both" if same_unit and same_driver else "unit" if same_unit else "driver"
        conflict = JobConflict(
            job_id=job.id,
            job_number=job.job_number,
            customer_nama=job.customer_nama,
            etd=job.etd,
            eta=job.eta,
            status=job.status,
            reason=reason,
        )
        if same_unit:
            unit.append(conflict)
        if same_driver:
            driver.append(conflict)

    return ConflictCheckResult(unit=unit, driver=driver, has_any=bool(unit or driver))
