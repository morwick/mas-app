"""Master Mekanik internal — dipilih dari data Karyawan (pola sama dengan Driver).

Schema `hr` tidak dibuka di Data API: daftar & pilihan nama lewat fungsi
database (migration 20260930000002). Baca: semua role yang login. Tambah /
ubah / hapus: superadmin & admin. Mekanik yang sudah pernah bertugas di
perintah kerja tidak bisa dihapus — nonaktifkan saja.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from supabase import AsyncClient

from app.core.auth import superadmin_or_admin_client, user_client
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.paging import Page, PageParams, page_params
from app.core.pg import rows, single
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/mekanik", tags=["mekanik"])


class Mekanik(BaseModel):
    id: str
    karyawan_id: str
    nama: str
    no_hp: str | None = None
    keahlian: str | None = None
    catatan: str | None = None
    is_active: bool = True
    karyawan_aktif: bool = True


class MekanikInput(BaseModel):
    karyawan_id: str = Field(min_length=1)
    no_hp: str | None = Field(default=None, max_length=30)
    keahlian: str | None = Field(default=None, max_length=200)
    catatan: str | None = Field(default=None, max_length=1000)

    @field_validator("no_hp", "keahlian", "catatan", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        if v is None:
            return None
        teks = " ".join(str(v).split())
        return teks or None


class KaryawanMekanikOption(BaseModel):
    id: str
    nama: str
    mekanik_id: str | None = None


def _to_mekanik(r: dict[str, Any]) -> Mekanik:
    return Mekanik(
        id=str(r["id"]),
        karyawan_id=str(r["karyawan_id"]),
        nama=r["nama"],
        no_hp=r.get("no_hp"),
        keahlian=r.get("keahlian"),
        catatan=r.get("catatan"),
        is_active=bool(r.get("is_active", True)),
        karyawan_aktif=bool(r.get("karyawan_aktif", True)),
    )


async def _daftar(
    client: AsyncClient, *, q: str | None, aktif: bool | None, limit: int | None, offset: int
) -> list[dict[str, Any]]:
    res = await client.rpc(
        "daftar_mekanik",
        {"p_q": (q or "").strip() or None, "p_aktif": aktif, "p_limit": limit, "p_offset": offset},
    ).execute()
    return rows(res)


@router.get("/page", response_model=Page[Mekanik])
async def daftar_mekanik(
    params: PageParams = Depends(page_params),
    q: Annotated[str | None, Query(max_length=100, description="Cari nama, no HP, atau keahlian")] = None,
    aktif: Literal["aktif", "nonaktif"] | None = None,
    client: AsyncClient = Depends(user_client),
) -> Page[Mekanik]:
    data = await _daftar(
        client,
        q=q,
        aktif=None if aktif is None else aktif == "aktif",
        limit=params.last_index - params.offset + 1,
        offset=params.offset,
    )
    return Page[Mekanik](
        items=[_to_mekanik(r) for r in data],
        total=int(data[0]["total"]) if data else 0,
        page=params.page,
        page_size=params.page_size,
    )


@router.get("", response_model=list[Mekanik])
async def semua_mekanik(
    include_inactive: bool = Query(False), client: AsyncClient = Depends(user_client)
) -> list[Mekanik]:
    """Tanpa potongan — untuk pilihan mekanik di perintah kerja."""
    data = await _daftar(client, q=None, aktif=None if include_inactive else True, limit=None, offset=0)
    return [_to_mekanik(r) for r in data]


@router.get("/karyawan-pilihan", response_model=list[KaryawanMekanikOption])
async def karyawan_pilihan(client: AsyncClient = Depends(user_client)) -> list[KaryawanMekanikOption]:
    """Pilihan nama di form mekanik: semua karyawan aktif."""
    res = await client.rpc("karyawan_untuk_mekanik").execute()
    return [
        KaryawanMekanikOption(
            id=str(r["id"]), nama=r["nama"], mekanik_id=str(r["mekanik_id"]) if r.get("mekanik_id") else None
        )
        for r in rows(res)
    ]


async def _cek_karyawan(client: AsyncClient, karyawan_id: str, kecuali_mekanik: str | None = None) -> None:
    res = await client.rpc("karyawan_untuk_mekanik").execute()
    pilihan = next((r for r in rows(res) if str(r["id"]) == karyawan_id), None)
    if pilihan is None:
        raise ValidationError("Karyawan tidak ditemukan atau berstatus nonaktif.")
    if pilihan.get("mekanik_id") and str(pilihan["mekanik_id"]) != kecuali_mekanik:
        raise ConflictError(f"{pilihan['nama']} sudah terdaftar sebagai mekanik.")


def _data(payload: MekanikInput) -> dict[str, Any]:
    return {"karyawan_id": payload.karyawan_id, "no_hp": payload.no_hp, "keahlian": payload.keahlian,
            "catatan": payload.catatan}  # fmt: skip


@router.post("", response_model=OkResponse, status_code=201)
async def tambah_mekanik(
    payload: MekanikInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    await _cek_karyawan(client, payload.karyawan_id)
    await client.table("mekanik").insert(_data(payload)).execute()
    return OkResponse()


@router.patch("/{mekanik_id}", response_model=OkResponse)
async def ubah_mekanik(
    mekanik_id: str, payload: MekanikInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    lama = single(await client.table("mekanik").select("id, karyawan_id").eq("id", mekanik_id).maybe_single().execute())
    if lama is None:
        raise NotFoundError("Mekanik tidak ditemukan")
    if payload.karyawan_id != str(lama["karyawan_id"]):
        await _cek_karyawan(client, payload.karyawan_id, kecuali_mekanik=mekanik_id)
    await client.table("mekanik").update(_data(payload)).eq("id", mekanik_id).execute()
    return OkResponse()


async def _set_aktif(client: AsyncClient, mekanik_id: str, aktif: bool) -> None:
    res = await client.table("mekanik").update({"is_active": aktif}).eq("id", mekanik_id).execute()
    if not rows(res):
        raise NotFoundError("Mekanik tidak ditemukan")


@router.post("/{mekanik_id}/deactivate", response_model=OkResponse)
async def nonaktifkan_mekanik(mekanik_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    await _set_aktif(client, mekanik_id, False)
    return OkResponse()


@router.post("/{mekanik_id}/active", response_model=OkResponse)
async def aktifkan_mekanik(mekanik_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    await _set_aktif(client, mekanik_id, True)
    return OkResponse()


@router.delete("/{mekanik_id}", response_model=OkResponse)
async def hapus_mekanik(mekanik_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    dipakai = await client.table("perintah_kerja_mekanik").select("id").eq("mekanik_id", mekanik_id).limit(1).execute()
    if rows(dipakai):
        raise ConflictError(
            "Mekanik ini sudah pernah bertugas di perintah kerja, jadi tidak bisa dihapus. Nonaktifkan saja."
        )
    res = await client.table("mekanik").delete().eq("id", mekanik_id).execute()
    if not rows(res):
        raise NotFoundError("Mekanik tidak ditemukan")
    return OkResponse()
