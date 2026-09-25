"""Data agregat untuk dashboard dan kerangka layout (sidebar/header)."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends
from postgrest.types import CountMethod
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.core.auth import superadmin_or_finance_client, user_client
from app.core.pg import first, rows
from app.core.soft_delete import AKTIF
from app.modules.drivers.service import DriverService
from app.modules.invoices.schemas import FinanceDashboardSummary
from app.modules.invoices.service import InvoiceService
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


class JobBelumKonfirmasi(BaseModel):
    id: str
    job_number: str
    customer_nama: str
    driver_nama: str


class DashboardResponse(BaseModel):
    units: list[Unit]
    counts: UnitStatusCounts
    active_jobs: list[DashboardActiveJobByUnit]
    jobs_menunggu_validasi: int = 0
    uang_jalan_diajukan: int = 0
    # Job sudah ditugaskan tapi drivernya belum menekan Terima — admin perlu
    # follow up drivernya supaya job tidak macet dari awal. List (bukan cuma
    # jumlah) supaya dashboard bisa menunjuk job & driver mana yang dimaksud.
    job_belum_konfirmasi: list[JobBelumKonfirmasi] = Field(default_factory=list)
    # Job sudah selesai & tervalidasi tapi belum masuk tagihan mana pun
    # (sama seperti tab "Job siap ditagih" di menu Tagihan).
    jobs_belum_invoice: int = 0


async def _jobs_belum_konfirmasi(client: AsyncClient) -> list[JobBelumKonfirmasi]:
    """Job berstatus 'ditugaskan' — driver belum menekan Terima Job."""
    res = await (
        client.table("jobs")
        .select("id, job_number, customer:customers(nama_perusahaan), driver:drivers(nama)")
        .eq("status_job", "ditugaskan")
        .execute()
    )
    return [
        JobBelumKonfirmasi(
            id=job["id"],
            job_number=job["job_number"],
            customer_nama=(first(job.get("customer")) or {}).get("nama_perusahaan") or "—",
            driver_nama=(first(job.get("driver")) or {}).get("nama") or "—",
        )
        for job in rows(res)
    ]


async def _count_jobs_belum_invoice(client: AsyncClient) -> int:
    per_customer = await InvoiceService(client).jobs_belum_ditagih()
    return sum(len(v) for v in per_customer.values())


async def _safe_list(coro: object) -> list:
    try:
        return await coro  # type: ignore[return-value,misc]
    except Exception:  # noqa: BLE001 — dashboard tidak boleh gagal karena satu hitungan
        return []


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
    units, counts, active_jobs, drivers, validasi, pengajuan, belum_konfirmasi, belum_invoice = await asyncio.gather(
        unit_svc.list_all(),
        unit_svc.status_counts(),
        JobService(client).active_by_unit(),
        DriverService(client).list_all(),
        _safe_count(JobService(client).count_by_status("menunggu_validasi")),
        _safe_count(_count_pending_requests(client)),
        _safe_list(_jobs_belum_konfirmasi(client)),
        _safe_count(_count_jobs_belum_invoice(client)),
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
        job_belum_konfirmasi=belum_konfirmasi,
        jobs_belum_invoice=belum_invoice,
    )


@router.get("/dashboard/finance", response_model=FinanceDashboardSummary)
async def dashboard_finance(
    client: AsyncClient = Depends(superadmin_or_finance_client),
) -> FinanceDashboardSummary:
    return await InvoiceService(client).finance_dashboard_summary()
