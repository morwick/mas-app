"""Master jenis biaya (tol, parkir, bongkar muat, dst) untuk Biaya Lain job."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, superadmin_or_admin_client, user_client
from app.core.errors import ConflictError, ValidationError
from app.core.pg import rows
from app.core.soft_delete import DIHAPUS, STATUS
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/jenis-biaya", tags=["jenis-biaya"])


class JenisBiaya(BaseModel):
    id: str
    nama: str


class JenisBiayaInput(BaseModel):
    nama: str = Field(min_length=1, max_length=80)


_DUPLIKAT = "Gagal! Jenis Biaya dengan nama ini sudah ada"


def kunci_nama(nama: str) -> str:
    """Bentuk pembanding: tanpa beda huruf besar/kecil dan spasi berlebih."""
    return " ".join(nama.split()).casefold()


def bersihkan_nama(nama: str) -> str:
    nama = " ".join(nama.split())
    if not nama:
        raise ValidationError("Nama jenis biaya wajib diisi")
    return nama


async def _pastikan_nama_unik(client: AsyncClient, nama: str, kecuali_id: str | None = None) -> None:
    # BATASAN: nama jenis biaya aktif tidak boleh kembar. Dibandingkan di Python
    # (jumlahnya kecil; ilike membaca `_`/`%` sebagai wildcard). Index unik
    # database (migration 20261003000009) tetap penjaga terakhir.
    res = await client.table("jenis_biaya").select("id, nama").execute()
    kunci = kunci_nama(nama)
    for r in rows(res):
        if r["id"] != kecuali_id and kunci_nama(str(r.get("nama") or "")) == kunci:
            raise ConflictError(_DUPLIKAT)


@router.get("", response_model=list[JenisBiaya])
async def list_jenis_biaya(client: AsyncClient = Depends(user_client)) -> list[JenisBiaya]:
    res = await client.table("jenis_biaya").select("id, nama").order("nama").execute()
    return [JenisBiaya(**r) for r in rows(res)]


@router.post("", response_model=JenisBiaya, status_code=201)
async def create_jenis_biaya(
    payload: JenisBiayaInput,
    auth: AuthContext = Depends(require_auth),
    client: AsyncClient = Depends(superadmin_or_admin_client),
) -> JenisBiaya:
    nama = bersihkan_nama(payload.nama)
    await _pastikan_nama_unik(client, nama)
    try:
        res = await client.table("jenis_biaya").insert({"nama": nama, "created_by": auth.user.id}).execute()
    except APIError as exc:
        if exc.code == "23505":
            raise ConflictError(_DUPLIKAT) from exc
        raise
    r = rows(res)[0]
    return JenisBiaya(id=r["id"], nama=r["nama"])


@router.patch("/{jenis_id}", response_model=OkResponse)
async def update_jenis_biaya(
    jenis_id: str, payload: JenisBiayaInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    nama = bersihkan_nama(payload.nama)
    await _pastikan_nama_unik(client, nama, kecuali_id=jenis_id)
    try:
        await client.table("jenis_biaya").update({"nama": nama}).eq("id", jenis_id).execute()
    except APIError as exc:
        if exc.code == "23505":
            raise ConflictError(_DUPLIKAT) from exc
        raise
    return OkResponse()


@router.delete("/{jenis_id}", response_model=OkResponse)
async def delete_jenis_biaya(jenis_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    try:
        await client.table("jenis_biaya").update({STATUS: DIHAPUS}).eq("id", jenis_id).execute()
    except APIError as exc:
        # BATASAN: jenis biaya yang masih dipakai biaya lain aktif tidak bisa dihapus.
        if exc.code == "23503":
            raise ConflictError("Jenis biaya ini masih dipakai di biaya lain job, jadi tidak bisa dihapus.") from exc
        raise
    return OkResponse()
