"""Data agregat untuk dashboard dan kerangka layout (sidebar/header)."""

from __future__ import annotations

import asyncio
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from postgrest.types import CountMethod
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.core.auth import superadmin_or_finance_client, user_client
from app.core.pg import first, rows
from app.core.soft_delete import AKTIF
from app.core.timeutil import today_wib
from app.modules.dashboard.dokumen import DokumenJatuhTempo, dokumen_jatuh_tempo
from app.modules.dashboard.servis import MonitoringServis, monitoring_servis
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


# Penawaran terkirim yang masa berlakunya tinggal segini (hari) = "akan kedaluwarsa".
PENAWARAN_AKAN_KEDALUWARSA_HARI = 7


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
    # STNK / KIR / pajak / SIM yang sudah habis atau habis ≤ 30 hari lagi —
    # dulu notifikasi, kini bagian kartu "Perlu tindakan".
    dokumen_jatuh_tempo: list[DokumenJatuhTempo] = Field(default_factory=list)
    # Kartu "Monitoring servis": lewat jadwal & mendekati — dulu notifikasi.
    monitoring_servis: MonitoringServis = Field(default_factory=MonitoringServis)
    # Kartu "Perlu tindakan" — cukup angkanya; daftarnya di halaman Penawaran.
    penawaran_deal_tanpa_job: int = 0
    penawaran_akan_kedaluwarsa: int = 0


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


async def penawaran_deal_tanpa_job(client: AsyncClient) -> int:
    """Jumlah penawaran deal yang masih punya item deal belum dibuatkan job."""
    res = await (
        client.table("quotations")
        .select("id, quotation_items(id, keputusan), jobs(quotation_item_id, status_job)")
        .eq("status_penawaran", "deal")
        .eq("quotation_items.status", AKTIF)
        .eq("jobs.status", AKTIF)
        .execute()
    )
    jumlah = 0
    for q in rows(res):
        punya_job = {
            j["quotation_item_id"]
            for j in (q.get("jobs") or [])
            if j.get("quotation_item_id") and j.get("status_job") != "cancelled"
        }
        if any(it.get("keputusan") == "deal" and it["id"] not in punya_job for it in (q.get("quotation_items") or [])):
            jumlah += 1
    return jumlah


async def penawaran_akan_kedaluwarsa(client: AsyncClient, hari_ini: date) -> int:
    """Penawaran terkirim yang masih berlaku tapi habis dalam beberapa hari lagi."""
    res = await (
        client.table("quotations")
        .select("id", count=CountMethod.exact, head=True)
        .eq("status_penawaran", "terkirim")
        .gte("berlaku_sampai", hari_ini.isoformat())
        .lte("berlaku_sampai", (hari_ini + timedelta(days=PENAWARAN_AKAN_KEDALUWARSA_HARI)).isoformat())
        .execute()
    )
    return res.count or 0


async def _count_jobs_belum_invoice(client: AsyncClient) -> int:
    per_customer = await InvoiceService(client).jobs_belum_ditagih()
    return sum(len(v) for v in per_customer.values())


async def _safe_servis(client: AsyncClient) -> MonitoringServis:
    try:
        return await monitoring_servis(client)
    except Exception:  # noqa: BLE001 — dashboard tidak boleh gagal karena satu kartu
        return MonitoringServis()


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
    (
        units,
        counts,
        active_jobs,
        drivers,
        validasi,
        pengajuan,
        belum_konfirmasi,
        belum_invoice,
        dokumen,
        servis,
        penawaran_deal,
        penawaran_habis,
    ) = await asyncio.gather(
        unit_svc.list_all(),
        unit_svc.status_counts(),
        JobService(client).active_by_unit(),
        DriverService(client).list_all(),
        _safe_count(JobService(client).count_by_status("menunggu_validasi")),
        _safe_count(_count_pending_requests(client)),
        _safe_list(_jobs_belum_konfirmasi(client)),
        _safe_count(_count_jobs_belum_invoice(client)),
        _safe_list(dokumen_jatuh_tempo(client, today_wib())),
        _safe_servis(client),
        _safe_count(penawaran_deal_tanpa_job(client)),
        _safe_count(penawaran_akan_kedaluwarsa(client, today_wib())),
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
        dokumen_jatuh_tempo=dokumen,
        monitoring_servis=servis,
        penawaran_deal_tanpa_job=penawaran_deal,
        penawaran_akan_kedaluwarsa=penawaran_habis,
    )


@router.get("/dashboard/finance", response_model=FinanceDashboardSummary)
async def dashboard_finance(
    client: AsyncClient = Depends(superadmin_or_finance_client),
) -> FinanceDashboardSummary:
    return await InvoiceService(client).finance_dashboard_summary()
