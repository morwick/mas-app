"""Menu Karyawan (hr.karyawan) — super administrator saja.

Schema `hr` tidak dibuka di Data API; semua lewat fungsi database
(migration 20260924000020) yang sekaligus menyaring status = 1, paging
LIMIT/OFFSET, dan mencatat log sistem. Hapus = soft delete (status 2).
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from supabase import AsyncClient

from app.core.auth import superadmin_client
from app.core.paging import Page, PageParams, page_params
from app.core.pg import rows
from app.core.timeutil import today_wib
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/karyawan", tags=["karyawan"])


class AkunKaryawanInfo(BaseModel):
    user_id: str
    role: str
    email: str | None = None


class DriverKaryawanInfo(BaseModel):
    id: str
    no_hp: str | None = None


class Karyawan(BaseModel):
    id: str
    nama: str
    tanggal_lahir: str | None = None
    alamat: str | None = None
    is_active: bool
    akun: list[AkunKaryawanInfo] = []
    driver: DriverKaryawanInfo | None = None


class KaryawanInput(BaseModel):
    nama: str = Field(min_length=1, max_length=150)
    tanggal_lahir: date | None = None
    alamat: str | None = Field(default=None, max_length=500)
    is_active: bool = True

    @field_validator("nama")
    @classmethod
    def _nama(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Nama karyawan wajib diisi")
        return v

    @field_validator("tanggal_lahir")
    @classmethod
    def _lahir(cls, v: date | None) -> date | None:
        if v is not None and v > today_wib():
            raise ValueError("Tanggal lahir tidak boleh di masa depan")
        return v


class KaryawanDisimpan(BaseModel):
    id: str


def _params(payload: KaryawanInput, karyawan_id: str | None) -> dict[str, object]:
    return {
        "p_id": karyawan_id,
        "p_nama": payload.nama,
        "p_tanggal_lahir": payload.tanggal_lahir.isoformat() if payload.tanggal_lahir else None,
        "p_alamat": (payload.alamat or "").strip() or None,
        "p_is_active": payload.is_active,
    }


@router.get("", response_model=Page[Karyawan])
async def daftar_karyawan(
    params: PageParams = Depends(page_params),
    q: Annotated[str | None, Query(max_length=100, description="Cari nama atau alamat")] = None,
    aktif: Literal["aktif", "nonaktif"] | None = None,
    client: AsyncClient = Depends(superadmin_client),
) -> Page[Karyawan]:
    limit = params.last_index - params.offset + 1
    res = await client.rpc(
        "daftar_karyawan",
        {
            "p_q": (q or "").strip() or None,
            "p_aktif": None if aktif is None else aktif == "aktif",
            "p_limit": limit,
            "p_offset": params.offset,
        },
    ).execute()
    data = rows(res)
    return Page[Karyawan](
        items=[
            Karyawan(
                id=str(r["id"]),
                nama=r["nama"],
                tanggal_lahir=r.get("tanggal_lahir"),
                alamat=r.get("alamat"),
                is_active=bool(r["is_active"]),
                akun=r.get("akun") or [],
                driver=r.get("driver"),
            )
            for r in data
        ],
        total=int(data[0]["total"]) if data else 0,
        page=params.page,
        page_size=params.page_size,
    )


async def _simpan(client: AsyncClient, payload: KaryawanInput, karyawan_id: str | None) -> KaryawanDisimpan:
    # Satu panggilan fungsi = satu transaksi (gagal di tengah → rollback).
    res = await client.rpc("simpan_karyawan", _params(payload, karyawan_id)).execute()
    return KaryawanDisimpan(id=str(res.data))


@router.post("", response_model=KaryawanDisimpan, status_code=201)
async def tambah_karyawan(payload: KaryawanInput, client: AsyncClient = Depends(superadmin_client)) -> KaryawanDisimpan:
    return await _simpan(client, payload, None)


@router.patch("/{karyawan_id}", response_model=KaryawanDisimpan)
async def ubah_karyawan(
    karyawan_id: str, payload: KaryawanInput, client: AsyncClient = Depends(superadmin_client)
) -> KaryawanDisimpan:
    return await _simpan(client, payload, karyawan_id)


@router.delete("/{karyawan_id}", response_model=OkResponse)
async def hapus_karyawan(karyawan_id: str, client: AsyncClient = Depends(superadmin_client)) -> OkResponse:
    """Soft delete: UPDATE hr.karyawan SET status = 2 (bukan DELETE)."""
    await client.rpc("hapus_karyawan", {"p_id": karyawan_id}).execute()
    return OkResponse()
