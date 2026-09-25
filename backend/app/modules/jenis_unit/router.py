"""Master jenis unit (Lowbed, Highbed, dst)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.core.auth import superadmin_or_admin_client, user_client
from app.core.errors import ConflictError, ValidationError
from app.core.pg import rows
from app.core.soft_delete import DIHAPUS, STATUS
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/jenis-unit", tags=["jenis-unit"])


class JenisUnit(BaseModel):
    id: str
    nama: str
    is_active: bool


class JenisUnitInput(BaseModel):
    nama: str = Field(min_length=1, max_length=80)


_DUPLIKAT = "Gagal! Jenis Unit dengan nama ini sudah ada"


def _kunci(nama: str) -> str:
    """Bentuk pembanding: tanpa beda huruf besar/kecil dan spasi berlebih."""
    return " ".join(nama.split()).casefold()


def _bersihkan(nama: str) -> str:
    nama = " ".join(nama.split())
    if not nama:
        raise ValidationError("Nama jenis unit wajib diisi")
    return nama


async def _pastikan_nama_unik(client: AsyncClient, nama: str, kecuali_id: str | None = None) -> None:
    # Dibandingkan di Python: jumlah jenis unit kecil, dan filter ilike akan
    # membaca `_`/`%` sebagai wildcard. Index unik di database (migration
    # 20260924000006) tetap menjadi penjaga terakhir.
    res = await client.table("jenis_unit").select("id, nama").execute()
    kunci = _kunci(nama)
    for r in rows(res):
        if r["id"] != kecuali_id and _kunci(str(r.get("nama") or "")) == kunci:
            raise ConflictError(_DUPLIKAT)


@router.get("", response_model=list[JenisUnit])
async def list_jenis_unit(client: AsyncClient = Depends(user_client)) -> list[JenisUnit]:
    res = await client.table("jenis_unit").select("*").order("nama").execute()
    return [JenisUnit(**r) for r in rows(res)]


@router.post("", response_model=JenisUnit, status_code=201)
async def create_jenis_unit(payload: JenisUnitInput, client: AsyncClient = Depends(superadmin_or_admin_client)) -> JenisUnit:
    nama = _bersihkan(payload.nama)
    await _pastikan_nama_unik(client, nama)
    try:
        res = await client.table("jenis_unit").insert({"nama": nama}).execute()
    except APIError as exc:
        if exc.code == "23505":
            raise ConflictError(_DUPLIKAT) from exc
        raise
    return JenisUnit(**rows(res)[0])


@router.patch("/{jenis_id}", response_model=OkResponse)
async def update_jenis_unit(
    jenis_id: str, payload: JenisUnitInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    nama = _bersihkan(payload.nama)
    await _pastikan_nama_unik(client, nama, kecuali_id=jenis_id)
    try:
        await client.table("jenis_unit").update({"nama": nama}).eq("id", jenis_id).execute()
    except APIError as exc:
        if exc.code == "23505":
            raise ConflictError(_DUPLIKAT) from exc
        raise
    return OkResponse()


@router.delete("/{jenis_id}", response_model=OkResponse)
async def delete_jenis_unit(jenis_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    try:
        await client.table("jenis_unit").update({STATUS: DIHAPUS}).eq("id", jenis_id).execute()
    except APIError as exc:
        if exc.code == "23503":
            raise ConflictError("Jenis ini masih dipakai oleh unit aktif. Hapus / pindahkan unit dulu.") from exc
        raise
    return OkResponse()
