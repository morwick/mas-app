"""Master Bengkel luar — pelaksana perbaikan di luar mekanik internal.

Baca: semua role yang login. Tambah / ubah / hapus: superadmin & admin.
Hapus = soft delete; bengkel yang sudah dipakai perintah kerja ditolak
database — nonaktifkan saja.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from postgrest.exceptions import APIError
from postgrest.types import CountMethod
from pydantic import BaseModel, Field, field_validator
from supabase import AsyncClient

from app.core.auth import superadmin_or_admin_client, user_client
from app.core.errors import ConflictError, NotFoundError
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any, page_params
from app.core.pg import rows, single
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/bengkel", tags=["bengkel"])

_DUPLIKAT = "Bengkel dengan nama ini sudah ada"
_CARI = ["nama", "alamat", "pic_nama", "no_hp", "spesialisasi"]


class Bengkel(BaseModel):
    id: str
    nama: str
    alamat: str | None = None
    pic_nama: str | None = None
    no_hp: str | None = None
    spesialisasi: str | None = None
    catatan: str | None = None
    is_active: bool = True


class BengkelInput(BaseModel):
    nama: str = Field(min_length=1, max_length=150)
    alamat: str | None = Field(default=None, max_length=500)
    pic_nama: str | None = Field(default=None, max_length=150)
    no_hp: str | None = Field(default=None, max_length=30)
    spesialisasi: str | None = Field(default=None, max_length=200)
    catatan: str | None = Field(default=None, max_length=1000)

    @field_validator("nama", "alamat", "pic_nama", "no_hp", "spesialisasi", "catatan", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        if v is None:
            return None
        teks = " ".join(str(v).split())
        return teks or None

    @field_validator("nama")
    @classmethod
    def _nama(cls, v: str | None) -> str:
        if not v:
            raise ValueError("Nama bengkel wajib diisi")
        return v


def _to_bengkel(r: dict[str, Any]) -> Bengkel:
    return Bengkel(
        id=r["id"],
        nama=r["nama"],
        alamat=r.get("alamat"),
        pic_nama=r.get("pic_nama"),
        no_hp=r.get("no_hp"),
        spesialisasi=r.get("spesialisasi"),
        catatan=r.get("catatan"),
        is_active=bool(r.get("is_active", True)),
    )


def _filter(query: Any, q: str | None, aktif: Literal["aktif", "nonaktif"] | None) -> Any:
    if aktif is not None:
        query = query.eq("is_active", aktif == "aktif")
    if q and q.strip():
        query = query.or_(ilike_any(_CARI, q))
    return query


async def _pastikan_unik(client: AsyncClient, nama: str, kecuali_id: str | None = None) -> None:
    kunci = nama.casefold()
    for r in rows(await client.table("bengkel").select("id, nama").execute()):
        if r["id"] != kecuali_id and " ".join(str(r.get("nama") or "").split()).casefold() == kunci:
            raise ConflictError(_DUPLIKAT)


@router.get("/page", response_model=Page[Bengkel])
async def daftar_bengkel(
    params: PageParams = Depends(page_params),
    q: Annotated[str | None, Query(max_length=100)] = None,
    aktif: Literal["aktif", "nonaktif"] | None = None,
    client: AsyncClient = Depends(user_client),
) -> Page[Bengkel]:
    query = _filter(client.table("bengkel").select("*", count=CountMethod.exact), q, aktif)
    res = await apply_window(query.order("nama").order("id"), params).execute()
    return build_page([_to_bengkel(r) for r in rows(res)], res.count, params)


@router.get("/counts", response_model=dict[str, int])
async def jumlah_bengkel(
    q: Annotated[str | None, Query(max_length=100)] = None, client: AsyncClient = Depends(user_client)
) -> dict[str, int]:
    out: dict[str, int] = {}
    for key, flag in (("active", "aktif"), ("inactive", "nonaktif")):
        query = _filter(client.table("bengkel").select("id", count=CountMethod.exact, head=True), q, flag)  # type: ignore[arg-type]
        out[key] = (await query.execute()).count or 0
    out["all"] = out["active"] + out["inactive"]
    return out


@router.get("", response_model=list[Bengkel])
async def semua_bengkel(
    include_inactive: bool = Query(False), client: AsyncClient = Depends(user_client)
) -> list[Bengkel]:
    """Tanpa potongan — untuk dropdown bengkel di form perintah kerja."""
    query = client.table("bengkel").select("*").order("nama")
    if not include_inactive:
        query = query.eq("is_active", True)
    return [_to_bengkel(r) for r in rows(await query.execute())]


@router.get("/{bengkel_id}", response_model=Bengkel)
async def detail_bengkel(bengkel_id: str, client: AsyncClient = Depends(user_client)) -> Bengkel:
    row = single(await client.table("bengkel").select("*").eq("id", bengkel_id).maybe_single().execute())
    if row is None:
        raise NotFoundError("Bengkel tidak ditemukan")
    return _to_bengkel(row)


def _duplikat(exc: APIError) -> None:
    if exc.code == "23505":
        raise ConflictError(_DUPLIKAT) from exc


@router.post("", response_model=Bengkel, status_code=201)
async def tambah_bengkel(payload: BengkelInput, client: AsyncClient = Depends(superadmin_or_admin_client)) -> Bengkel:
    await _pastikan_unik(client, payload.nama)
    try:
        res = await client.table("bengkel").insert(payload.model_dump()).execute()
    except APIError as exc:
        _duplikat(exc)
        raise
    return _to_bengkel(rows(res)[0])


@router.patch("/{bengkel_id}", response_model=OkResponse)
async def ubah_bengkel(
    bengkel_id: str, payload: BengkelInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    await _pastikan_unik(client, payload.nama, kecuali_id=bengkel_id)
    try:
        res = await client.table("bengkel").update(payload.model_dump()).eq("id", bengkel_id).execute()
    except APIError as exc:
        _duplikat(exc)
        raise
    if not rows(res):
        raise NotFoundError("Bengkel tidak ditemukan atau sudah dihapus")
    return OkResponse()


async def _set_aktif(client: AsyncClient, bengkel_id: str, aktif: bool) -> None:
    res = await client.table("bengkel").update({"is_active": aktif}).eq("id", bengkel_id).execute()
    if not rows(res):
        raise NotFoundError("Bengkel tidak ditemukan atau sudah dihapus")


@router.post("/{bengkel_id}/deactivate", response_model=OkResponse)
async def nonaktifkan_bengkel(bengkel_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    await _set_aktif(client, bengkel_id, False)
    return OkResponse()


@router.post("/{bengkel_id}/active", response_model=OkResponse)
async def aktifkan_bengkel(bengkel_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    await _set_aktif(client, bengkel_id, True)
    return OkResponse()


@router.delete("/{bengkel_id}", response_model=OkResponse)
async def hapus_bengkel(bengkel_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    dipakai = await client.table("perintah_kerja").select("id").eq("bengkel_id", bengkel_id).limit(1).execute()
    if rows(dipakai):
        raise ConflictError("Bengkel ini sudah dipakai di perintah kerja, jadi tidak bisa dihapus. Nonaktifkan saja.")
    res = await client.table("bengkel").delete().eq("id", bengkel_id).execute()
    if not rows(res):
        raise NotFoundError("Bengkel tidak ditemukan atau sudah dihapus")
    return OkResponse()
