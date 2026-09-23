"""Data agregat untuk dashboard dan kerangka layout (sidebar/header)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from postgrest.types import CountMethod
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
    jobs_menunggu_validasi: int = 0
    uang_jalan_diajukan: int = 0


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
    jobs_menunggu_validasi: int = 0
    uang_jalan_diajukan: int = 0


async def _count_pending_requests(client: AsyncClient) -> int:
    res = await (
        client.table("uang_jalan_requests")
        .select("id", count=CountMethod.exact, head=True)
        .eq("status", "diajukan")
        .execute()
    )
    return res.count or 0


async def _safe_count(coro: object) -> int:
    try:
        return int(await coro)  # type: ignore[misc]
    except Exception:  # noqa: BLE001 — sidebar tidak boleh gagal karena satu hitungan
        return 0


@router.get("/layout/counts", response_model=LayoutCounts)
async def layout_counts(client: AsyncClient = Depends(user_client)) -> LayoutCounts:
    units, jobs, drivers, validasi, pengajuan = await asyncio.gather(
        _safe_count(UnitService(client).count_active()),
        _safe_count(JobService(client).count_active()),
        _safe_count(DriverService(client).count_active()),
        _safe_count(JobService(client).count_by_status("menunggu_validasi")),
        _safe_count(_count_pending_requests(client)),
    )
    return LayoutCounts(
        units=units,
        jobs_active=jobs,
        drivers_available=drivers,
        jobs_menunggu_validasi=validasi,
        uang_jalan_diajukan=pengajuan,
    )


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(client: AsyncClient = Depends(user_client)) -> DashboardResponse:
    unit_svc = UnitService(client)
    units, counts, active_jobs, drivers, validasi, pengajuan = await asyncio.gather(
        unit_svc.list_all(),
        unit_svc.status_counts(),
        JobService(client).active_by_unit(),
        DriverService(client).list_all(),
        _safe_count(JobService(client).count_by_status("menunggu_validasi")),
        _safe_count(_count_pending_requests(client)),
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
        jobs_menunggu_validasi=validasi,
        uang_jalan_diajukan=pengajuan,
    )
