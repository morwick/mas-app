"""Data agregat untuk dashboard dan kerangka layout (sidebar/header)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from postgrest.types import CountMethod
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.auth import user_client
from app.core.pg import rows
from app.core.soft_delete import AKTIF
from app.modules.drivers.service import DriverService
from app.modules.jobs.service import JobService
from app.modules.units.schemas import BUKAN_ARMADA, Unit, UnitStatusCounts
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
    # Job sudah ditugaskan/diterima driver tapi belum ada pencairan berbukti
    # transfer — tahap muat driver terkunci (BR-02) sampai admin mentransfer.
    uang_jalan_belum_transfer: int = 0


# Job yang belum mulai muat: driver hanya bisa lanjut ke loading setelah ada
# pencairan uang jalan dengan bukti transfer.
_BELUM_MUAT = ["ditugaskan", "diterima"]


async def _count_belum_transfer(client: AsyncClient) -> int:
    """Job sebelum muat yang belum punya pencairan berbukti transfer.

    Job yang sudah punya pengajuan driver berstatus `diajukan` tidak dihitung
    di sini — job itu sudah muncul di hitungan pengajuan, jangan dobel.
    """
    res = await (
        client.table("jobs")
        .select("id, uang_jalan(jenis, bukti_transfer_path), uang_jalan_requests(status_pengajuan)")
        .in_("status_job", _BELUM_MUAT)
        .eq("uang_jalan.status", AKTIF)
        .eq("uang_jalan_requests.status", AKTIF)
        .execute()
    )
    jumlah = 0
    for job in rows(res):
        ada_bukti = any(
            u.get("jenis") == "pencairan" and u.get("bukti_transfer_path") for u in job.get("uang_jalan") or []
        )
        ada_pengajuan = any(r.get("status_pengajuan") == "diajukan" for r in job.get("uang_jalan_requests") or [])
        if not ada_bukti and not ada_pengajuan:
            jumlah += 1
    return jumlah


async def _count_pending_requests(client: AsyncClient) -> int:
    res = await (
        client.table("uang_jalan_requests")
        .select("id, job:jobs!inner(status_job)", count=CountMethod.exact, head=True)
        .eq("status_pengajuan", "diajukan")
        .neq("job.status_job", "cancelled")
        .eq("job.status", AKTIF)
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
    units, counts, active_jobs, drivers, validasi, pengajuan, belum_transfer = await asyncio.gather(
        unit_svc.list_all(),
        unit_svc.status_counts(),
        JobService(client).active_by_unit(),
        DriverService(client).list_all(),
        _safe_count(JobService(client).count_by_status("menunggu_validasi")),
        _safe_count(_count_pending_requests(client)),
        _safe_count(_count_belum_transfer(client)),
    )
    driver_names = {d.id: d.nama for d in drivers}
    return DashboardResponse(
        # Unit terjual / diafkirkan bukan lagi bagian armada.
        units=[u for u in units if u.status not in BUKAN_ARMADA],
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
        uang_jalan_belum_transfer=belum_transfer,
    )
