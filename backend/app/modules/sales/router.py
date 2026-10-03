"""Master sales — daftar untuk dropdown Sales di Detail Pengiriman job.

Sales baru tidak ditambah lewat endpoint terpisah: nama yang diketik di form
job disimpan bersama job-nya dalam satu transaksi (lihat SalesService).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import AsyncClient

from app.core.auth import user_client
from app.modules.sales.schemas import Sales
from app.modules.sales.service import SalesService

router = APIRouter(prefix="/sales", tags=["sales"])


@router.get("", response_model=list[Sales])
async def daftar_sales(client: AsyncClient = Depends(user_client)) -> list[Sales]:
    return await SalesService(client).daftar()
