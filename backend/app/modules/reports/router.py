"""Laporan (super administrator & finance): utilisasi armada, laba per job,
biaya perawatan per aset, dan rekap klaim asuransi."""

from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.auth import AuthContext, require_role, superadmin_or_finance_client
from app.core.pg import num, rows
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.modules.invoices.schemas import JobProfitabilityRow
from app.modules.invoices.service import InvoiceService
from app.modules.perintah_kerja.laporan import BiayaPerawatanRow, KlaimAsuransiRow, biaya_perawatan, rekap_klaim

router = APIRouter(prefix="/reports", tags=["reports"])


class UtilizationRow(BaseModel):
    unit_id: str
    kode_unit: str
    jenis: str
    hari_bertugas: float
    hari_standby: float
    hari_perbaikan: float
    persentase_utilisasi: float


@router.get("/utilization", response_model=list[UtilizationRow])
async def utilization(
    start: str = Query(..., description="ISO datetime"),
    end: str = Query(..., description="ISO datetime"),
    client: AsyncClient = Depends(superadmin_or_finance_client),
) -> list[UtilizationRow]:
    res = await client.rpc("get_unit_utilization", {"p_start_date": start, "p_end_date": end}).execute()
    return [
        UtilizationRow(
            unit_id=str(r["unit_id"]),
            kode_unit=str(r["kode_unit"]),
            jenis=str(r.get("jenis") or "—"),
            hari_bertugas=num(r.get("hari_bertugas")),
            hari_standby=num(r.get("hari_standby")),
            hari_perbaikan=num(r.get("hari_perbaikan")),
            persentase_utilisasi=num(r.get("persentase_utilisasi")),
        )
        for r in rows(res)
    ]


@router.get("/profitability", response_model=list[JobProfitabilityRow])
async def profitability(
    start: str | None = Query(None, description="YYYY-MM-DD"),
    end: str | None = Query(None, description="YYYY-MM-DD"),
    client: AsyncClient = Depends(superadmin_or_finance_client),
) -> list[JobProfitabilityRow]:
    return await InvoiceService(client).job_profitability(start=start, end=end)


async def _laporan_perawatan_client(
    auth: AuthContext = Depends(require_role("superadmin", "admin", "finance")),
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> AsyncIterator[AsyncClient]:
    """Laporan perawatan: superadmin, admin (pengelola perbaikan), finance."""
    async with factory.for_user(auth.token) as client:
        yield client


@router.get("/biaya-perawatan", response_model=list[BiayaPerawatanRow])
async def laporan_biaya_perawatan(
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
    client: AsyncClient = Depends(_laporan_perawatan_client),
) -> list[BiayaPerawatanRow]:
    """Biaya perbaikan per unit / unit trailer (perintah kerja dalam periode)."""
    return await biaya_perawatan(client, start, end)


@router.get("/klaim-asuransi", response_model=list[KlaimAsuransiRow])
async def laporan_klaim_asuransi(
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
    client: AsyncClient = Depends(_laporan_perawatan_client),
) -> list[KlaimAsuransiRow]:
    """Rekap klaim per perusahaan asuransi (perintah kerja dalam periode)."""
    return await rekap_klaim(client, start, end)
