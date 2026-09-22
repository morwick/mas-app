"""Data agregat untuk dashboard dan kerangka layout (sidebar/header)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.auth import user_client
from app.modules.drivers.service import DriverService
from app.modules.jobs.service import JobService
from app.modules.units.schemas import Unit, UnitStatusCounts
from app.modules.units.service import UnitService

router = APIRouter(tags=["dashboard"])


class LayoutCounts(BaseModel):
    units: int
    jobs_active: int
    drivers_available: int


class DashboardActiveJob(BaseModel):
    id: str
    job_number: str
    asal: str
    tujuan: str
    driver_nama: str


class DashboardActiveJobByUnit(BaseModel):
    unit_id: str
    job: DashboardActiveJob


class DashboardResponse(BaseModel):
    units: list[Unit]
    counts: UnitStatusCounts
    active_jobs: list[DashboardActiveJobByUnit]


async def _safe_count(coro: object) -> int:
    try:
        return int(await coro)  # type: ignore[misc]
    except Exception:  # noqa: BLE001 — sidebar tidak boleh gagal karena satu hitungan
        return 0


@router.get("/layout/counts", response_model=LayoutCounts)
async def layout_counts(client: AsyncClient = Depends(user_client)) -> LayoutCounts:
    units, jobs, drivers = await asyncio.gather(
        _safe_count(UnitService(client).count_active()),
        _safe_count(JobService(client).count_active()),
        _safe_count(DriverService(client).count_active()),
    )
    return LayoutCounts(units=units, jobs_active=jobs, drivers_available=drivers)


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(client: AsyncClient = Depends(user_client)) -> DashboardResponse:
    unit_svc = UnitService(client)
    units, counts, active_jobs, drivers = await asyncio.gather(
        unit_svc.list_all(),
        unit_svc.status_counts(),
        JobService(client).active_by_unit(),
        DriverService(client).list_all(),
    )
    driver_names = {d.id: d.nama for d in drivers}
    return DashboardResponse(
        units=units,
        counts=counts,
        active_jobs=[
            DashboardActiveJobByUnit(
                unit_id=entry.unit_id,
                job=DashboardActiveJob(
                    id=entry.job.id,
                    job_number=entry.job.job_number,
                    asal=entry.job.asal,
                    tujuan=entry.job.tujuan,
                    driver_nama=driver_names.get(entry.job.driver_id, "—"),
                ),
            )
            for entry in active_jobs
        ],
    )
