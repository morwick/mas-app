"""Laporan (super administrator saja): utilisasi armada dan laba per job."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.auth import superadmin_client
from app.core.pg import num, rows
from app.modules.invoices.schemas import JobProfitabilityRow
from app.modules.invoices.service import InvoiceService

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
    client: AsyncClient = Depends(superadmin_client),
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
    client: AsyncClient = Depends(superadmin_client),
) -> list[JobProfitabilityRow]:
    return await InvoiceService(client).job_profitability(start=start, end=end)
