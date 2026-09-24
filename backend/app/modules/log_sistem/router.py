"""Log sistem (audit trail) — hanya super administrator.

Log ditulis database (migration 20260924000009); modul ini hanya membaca
lewat fungsi `daftar_log_sistem` (migration 20260924000010) yang sudah
menyaring baris aktif (status = 1), filter, dan paging di server.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.auth import superadmin_client
from app.core.errors import ValidationError
from app.core.paging import Page, PageParams, page_params
from app.core.pg import rows

router = APIRouter(prefix="/log-sistem", tags=["log-sistem"])

AksiLog = Literal["Login", "Logout", "Tambah Data", "Update Data", "Hapus Data"]


class LogSistem(BaseModel):
    id: str
    waktu: str
    aksi: AksiLog
    keterangan: str
    ip_address: str | None
    karyawan_id: str | None
    karyawan_nama: str | None


@router.get("", response_model=Page[LogSistem])
async def daftar_log(
    params: PageParams = Depends(page_params),
    dari: Annotated[date | None, Query(description="Tanggal awal (WIB), inklusif")] = None,
    sampai: Annotated[date | None, Query(description="Tanggal akhir (WIB), inklusif")] = None,
    karyawan_id: str | None = None,
    aksi: AksiLog | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    client: AsyncClient = Depends(superadmin_client),
) -> Page[LogSistem]:
    if dari and sampai and dari > sampai:
        raise ValidationError("Tanggal awal tidak boleh setelah tanggal akhir")
    # "Semua" tetap dibatasi pagar yang sama dengan daftar lain (app/core/paging.py).
    limit = params.last_index - params.offset + 1
    res = await client.rpc(
        "daftar_log_sistem",
        {
            "p_dari": dari.isoformat() if dari else None,
            "p_sampai": sampai.isoformat() if sampai else None,
            "p_karyawan": karyawan_id or None,
            "p_aksi": aksi,
            "p_cari": (q or "").strip() or None,
            "p_limit": limit,
            "p_offset": params.offset,
        },
    ).execute()
    data = rows(res)
    total = int(data[0]["total"]) if data else 0
    return Page[LogSistem](
        items=[
            LogSistem(
                id=str(r["id"]),
                waktu=str(r["waktu"]),
                aksi=r["aksi"],
                keterangan=r["keterangan"],
                ip_address=r.get("ip_address"),
                karyawan_id=r.get("karyawan_id"),
                karyawan_nama=r.get("karyawan_nama"),
            )
            for r in data
        ],
        total=total,
        page=params.page,
        page_size=params.page_size,
    )
