"""Perintah Kerja Perbaikan (work order) + klaim asuransi.

Baca: semua role yang login. Tambah / ubah / ubah status / hapus: superadmin & admin.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from supabase import AsyncClient

from app.core.auth import AuthContext, require_role, superadmin_or_admin_client, user_client
from app.core.paging import Page, PageParams, page_params
from app.modules.auth.schemas import OkResponse
from app.modules.perintah_kerja.schemas import (
    JenisFoto,
    JenisWo,
    Pelaksana,
    PerintahKerja,
    PerintahKerjaInput,
    PerintahKerjaRingkas,
    UbahStatusInput,
)
from app.modules.perintah_kerja.service import PerintahKerjaService

router = APIRouter(prefix="/perintah-kerja", tags=["perintah-kerja"])


@router.get("/page", response_model=Page[PerintahKerjaRingkas])
async def daftar_perintah_kerja(
    params: PageParams = Depends(page_params),
    q: Annotated[str | None, Query(max_length=100, description="Cari nomor, kode aset, atau keluhan")] = None,
    status: Annotated[str | None, Query(description="status_wo, 'aktif', atau 'terbuka'")] = None,
    pelaksana: Pelaksana | None = None,
    jenis: JenisWo | None = None,
    dari: date | None = None,
    sampai: date | None = None,
    unit_id: str | None = None,
    unit_trailer_id: str | None = None,
    incident_id: str | None = None,
    asuransi_id: str | None = None,
    client: AsyncClient = Depends(user_client),
) -> Page[PerintahKerjaRingkas]:
    return await PerintahKerjaService(client).list_page(
        params=params,
        q=q,
        status_wo=status,
        pelaksana=pelaksana,
        jenis=jenis,
        dari=dari,
        sampai=sampai,
        unit_id=unit_id,
        unit_trailer_id=unit_trailer_id,
        incident_id=incident_id,
        asuransi_id=asuransi_id,
    )


@router.get("/{wo_id}", response_model=PerintahKerja)
async def detail_perintah_kerja(wo_id: str, client: AsyncClient = Depends(user_client)) -> PerintahKerja:
    return await PerintahKerjaService(client).get(wo_id)


@router.post("", response_model=PerintahKerja, status_code=201)
async def tambah_perintah_kerja(
    payload: PerintahKerjaInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> PerintahKerja:
    svc = PerintahKerjaService(client)
    return await svc.get(await svc.create(payload))


@router.patch("/{wo_id}", response_model=OkResponse)
async def ubah_perintah_kerja(
    wo_id: str, payload: PerintahKerjaInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    await PerintahKerjaService(client).update(wo_id, payload)
    return OkResponse()


@router.post("/{wo_id}/status", response_model=OkResponse)
async def ubah_status_perintah_kerja(
    wo_id: str, payload: UbahStatusInput, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    await PerintahKerjaService(client).ubah_status(wo_id, payload)
    return OkResponse()


@router.delete("/{wo_id}", response_model=OkResponse)
async def hapus_perintah_kerja(wo_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)) -> OkResponse:
    """Hanya WO draft / dijadwalkan / dibatalkan (dijaga database)."""
    await PerintahKerjaService(client).delete(wo_id)
    return OkResponse()


@router.post("/{wo_id}/foto", response_model=OkResponse, status_code=201)
async def unggah_foto_perintah_kerja(
    wo_id: str,
    jenis: JenisFoto = Form("dokumen"),
    file: UploadFile = File(...),
    auth: AuthContext = Depends(require_role("superadmin", "admin")),
    client: AsyncClient = Depends(superadmin_or_admin_client),
) -> OkResponse:
    await PerintahKerjaService(client).upload_foto(
        wo_id,
        jenis=jenis,
        data=await file.read(),
        content_type=file.content_type,
        nama_file=file.filename,
        user_id=auth.user.id,
    )
    return OkResponse()


@router.delete("/{wo_id}/foto/{foto_id}", response_model=OkResponse)
async def hapus_foto_perintah_kerja(
    wo_id: str, foto_id: str, client: AsyncClient = Depends(superadmin_or_admin_client)
) -> OkResponse:
    await PerintahKerjaService(client).hapus_foto(wo_id, foto_id)
    return OkResponse()
