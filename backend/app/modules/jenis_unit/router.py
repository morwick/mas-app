"""Master jenis unit (Lowbed, Highbed, dst)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field
from supabase import AsyncClient

from app.core.auth import owner_client, user_client
from app.core.errors import ConflictError
from app.core.pg import rows
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/jenis-unit", tags=["jenis-unit"])


class JenisUnit(BaseModel):
    id: str
    nama: str
    is_active: bool


class JenisUnitInput(BaseModel):
    nama: str = Field(min_length=1, max_length=80)


@router.get("", response_model=list[JenisUnit])
async def list_jenis_unit(client: AsyncClient = Depends(user_client)) -> list[JenisUnit]:
    res = await client.table("jenis_unit").select("*").order("nama").execute()
    return [JenisUnit(**r) for r in rows(res)]


@router.post("", response_model=JenisUnit, status_code=201)
async def create_jenis_unit(payload: JenisUnitInput, client: AsyncClient = Depends(owner_client)) -> JenisUnit:
    try:
        res = await client.table("jenis_unit").insert({"nama": payload.nama.strip()}).execute()
    except APIError as exc:
        if exc.code == "23505":
            raise ConflictError("Nama jenis sudah ada") from exc
        raise
    return JenisUnit(**rows(res)[0])


@router.patch("/{jenis_id}", response_model=OkResponse)
async def update_jenis_unit(
    jenis_id: str, payload: JenisUnitInput, client: AsyncClient = Depends(owner_client)
) -> OkResponse:
    await client.table("jenis_unit").update({"nama": payload.nama.strip()}).eq("id", jenis_id).execute()
    return OkResponse()


@router.delete("/{jenis_id}", response_model=OkResponse)
async def delete_jenis_unit(jenis_id: str, client: AsyncClient = Depends(owner_client)) -> OkResponse:
    try:
        await client.table("jenis_unit").delete().eq("id", jenis_id).execute()
    except APIError as exc:
        if exc.code == "23503":
            raise ConflictError("Jenis ini masih dipakai oleh unit aktif. Hapus / pindahkan unit dulu.") from exc
        raise
    return OkResponse()
