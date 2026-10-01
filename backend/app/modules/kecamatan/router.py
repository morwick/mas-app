"""Master kecamatan (hr.kecamatan) — data referensi untuk rute surat penawaran.

Schema hr tidak dibuka lewat Data API, jadi dibaca lewat fungsi database
`transport.daftar_kecamatan()` (migration 20261001000001).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.auth import user_client
from app.core.pg import rows

router = APIRouter(prefix="/kecamatan", tags=["kecamatan"])


class Kecamatan(BaseModel):
    kode: str
    nama: str
    # Ringkas, mis. "Pekanbaru"; nama resmi mis. "Kota Pekanbaru".
    kab_kota: str
    kab_kota_resmi: str
    provinsi: str


@router.get("", response_model=list[Kecamatan])
async def list_kecamatan(client: AsyncClient = Depends(user_client)) -> list[Kecamatan]:
    # Fungsi mengembalikan satu array JSON (bukan SETOF) supaya ribuan baris
    # tidak terpotong batas baris PostgREST.
    res = await client.rpc("daftar_kecamatan", {}).execute()
    return [Kecamatan(**r) for r in rows(res)]
