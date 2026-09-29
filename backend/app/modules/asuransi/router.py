"""Master Asuransi & polis asuransi unit / unit trailer.

Baca: semua role yang login. Tambah / ubah / hapus: superadmin & admin.
Setiap simpan = satu transaksi database; tercatat di log sistem oleh trigger.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from supabase import AsyncClient

from app.core.auth import superadmin_or_admin_client, user_client
from app.core.dokumen import baca_berkas, parse_form
from app.core.paging import Page, PageParams, page_params
from app.modules.asuransi.polis import PolisService
from app.modules.asuransi.schemas import Asuransi, AsuransiInput, PolisAsuransi, PolisBaruInput, PolisInput
from app.modules.asuransi.service import AsuransiService
from app.modules.auth.schemas import OkResponse

router = APIRouter(prefix="/asuransi", tags=["asuransi"])
polis_router = APIRouter(prefix="/polis-asuransi", tags=["asuransi"])

Aktif = Literal["aktif", "nonaktif"]


def _aktif(v: Aktif | None) -> bool | None:
    return None if v is None else v == "aktif"


# ── Asuransi ────────────────────────────────────────────────────────────────


@router.get("/page", response_model=Page[Asuransi])
async def daftar_asuransi(
    params: PageParams = Depends(page_params),
    q: Annotated[str | None, Query(max_length=100, description="Cari nama asuransi, PIC, atau no HP")] = None,
    aktif: Aktif | None = None,
    client: AsyncClient = Depends(user_client),
) -> Page[Asuransi]:
    return await AsuransiService(client).list_page(params=params, q=q, aktif=_aktif(aktif))


@router.get("/counts", response_model=dict[str, int])
async def jumlah_asuransi(
    q: Annotated[str | None, Query(max_length=100)] = None, client: AsyncClient = Depends(user_client)
) -> dict[str, int]:
    return await AsuransiService(client).counts(q=q)


@router.get("", response_model=list[Asuransi])
async def semua_asuransi(
    include_inactive: bool = Query(False), client: AsyncClient = Depends(user_client)
) -> list[Asuransi]:
    """Tanpa potongan — untuk dropdown asuransi di form polis."""
    return await AsuransiService(client).list_all(include_inactive=include_inactive)


@router.get("/{asuransi_id}", response_model=Asuransi)
async def detail_asuransi(asuransi_id: str, client: AsyncClient = Depends(user_client)) -> Asuransi:
    return await AsuransiService(client).get(asuransi_id)


@router.get("/{asuransi_id}/polis", response_model=list[PolisAsuransi])
async def polis_milik_asuransi(asuransi_id: str, client: AsyncClient = Depends(user_client)) -> list[PolisAsuransi]:
    return await PolisService(client).list_by_asuransi(asuransi_id)


@router.post("", response_model=Asuransi, status_code=201)
async def tambah_asuransi(
    payload: AsuransiInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> Asuransi:
    return await AsuransiService(client).create(payload)


@router.patch("/{asuransi_id}", response_model=OkResponse)
async def ubah_asuransi(
    asuransi_id: str, payload: AsuransiInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    await AsuransiService(client).update(asuransi_id, payload)
    return OkResponse()


@router.post("/{asuransi_id}/deactivate", response_model=OkResponse)
async def nonaktifkan_asuransi(
    asuransi_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    await AsuransiService(client).set_active(asuransi_id, False)
    return OkResponse()


@router.post("/{asuransi_id}/active", response_model=OkResponse)
async def aktifkan_asuransi(asuransi_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    await AsuransiService(client).set_active(asuransi_id, True)
    return OkResponse()


@router.delete("/{asuransi_id}", response_model=OkResponse)
async def hapus_asuransi(asuransi_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    await AsuransiService(client).delete(asuransi_id)
    return OkResponse()


# ── Polis ───────────────────────────────────────────────────────────────────


@polis_router.get("", response_model=list[PolisAsuransi])
async def riwayat_polis(
    unit_id: str | None = None,
    unit_trailer_id: str | None = None,
    client: AsyncClient = Depends(user_client),
) -> list[PolisAsuransi]:
    """Riwayat polis satu aset (terbaru dulu)."""
    svc = PolisService(client)
    if unit_id:
        return await svc.riwayat("unit", unit_id)
    if unit_trailer_id:
        return await svc.riwayat("unit_trailer", unit_trailer_id)
    return []


@polis_router.get("/berlaku", response_model=PolisAsuransi | None)
async def polis_berlaku(
    tanggal: date,
    unit_id: str | None = None,
    unit_trailer_id: str | None = None,
    client: AsyncClient = Depends(user_client),
) -> PolisAsuransi | None:
    """Polis yang berlaku pada tanggal tertentu — untuk pilihan pelaksana Asuransi di perintah kerja."""
    svc = PolisService(client)
    if unit_id:
        return await svc.berlaku_pada("unit", unit_id, tanggal)
    if unit_trailer_id:
        return await svc.berlaku_pada("unit_trailer", unit_trailer_id, tanggal)
    return None


@polis_router.get("/{polis_id}", response_model=PolisAsuransi)
async def detail_polis(polis_id: str, client: AsyncClient = Depends(user_client)) -> PolisAsuransi:
    return await PolisService(client).get(polis_id)


@polis_router.post("", response_model=PolisAsuransi, status_code=201)
async def tambah_polis(
    data: str = Form(..., description="Isian PolisBaruInput (JSON)"),
    dokumen_polis: UploadFile | None = File(None, description="Scan/foto polis (opsional)"),
    client: AsyncClient = Depends(superadmin_or_admin_client),
) -> PolisAsuransi:
    """Polis baru atau perpanjangan (polis lama tetap tersimpan sebagai riwayat)."""
    return await PolisService(client).create(parse_form(PolisBaruInput, data), await baca_berkas(dokumen_polis))


@polis_router.patch("/{polis_id}", response_model=OkResponse)
async def ubah_polis(
    polis_id: str,
    data: str = Form(..., description="Isian PolisInput (JSON)"),
    dokumen_polis: UploadFile | None = File(None, description="Scan/foto polis pengganti (opsional)"),
    client: AsyncClient = Depends(superadmin_or_admin_client),
) -> OkResponse:
    await PolisService(client).update(polis_id, parse_form(PolisInput, data), await baca_berkas(dokumen_polis))
    return OkResponse()


@polis_router.delete("/{polis_id}", response_model=OkResponse)
async def hapus_polis(polis_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    await PolisService(client).delete(polis_id)
    return OkResponse()
