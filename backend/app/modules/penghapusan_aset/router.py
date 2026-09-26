from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.auth import superadmin_client
from app.core.paging import Page, PageParams, page_params
from app.modules.auth.schemas import OkResponse
from app.modules.penghapusan_aset.schemas import (
    AsetDihapus,
    BatalkanPenghapusanInput,
    PenghapusanAset,
    PenghapusanAsetInput,
    PenghapusanAsetUbah,
)
from app.modules.penghapusan_aset.service import PenghapusanAsetService
from app.modules.penjualan_unit.aset import JenisAset

router = APIRouter(prefix="/penghapusan-aset", tags=["penghapusan-aset"])


class PenghapusanCreated(BaseModel):
    id: str


def get_service(client: AsyncClient = Depends(superadmin_client)) -> PenghapusanAsetService:
    return PenghapusanAsetService(client)


@router.get("", response_model=Page[PenghapusanAset])
async def list_penghapusan(
    q: str | None = Query(None, description="Cari nomor berita acara, alasan, atau catatan"),
    jenis_aset: JenisAset | None = Query(None),
    params: PageParams = Depends(page_params),
    svc: PenghapusanAsetService = Depends(get_service),
) -> Page[PenghapusanAset]:
    return await svc.list_page(params=params, q=q, jenis_aset=jenis_aset)


@router.get("/aset-pilihan", response_model=list[AsetDihapus])
async def aset_pilihan(
    jenis_aset: JenisAset = Query(...),
    svc: PenghapusanAsetService = Depends(get_service),
) -> list[AsetDihapus]:
    """Unit/unit trailer yang belum Terjual / Diafkirkan — dropdown di form penghapusan."""
    return await svc.aset_pilihan(jenis_aset)


@router.get("/{penghapusan_id}", response_model=PenghapusanAset)
async def get_penghapusan(penghapusan_id: str, svc: PenghapusanAsetService = Depends(get_service)) -> PenghapusanAset:
    return await svc.get(penghapusan_id)


@router.post("", response_model=PenghapusanCreated, status_code=201)
async def create_penghapusan(
    payload: PenghapusanAsetInput, svc: PenghapusanAsetService = Depends(get_service)
) -> PenghapusanCreated:
    return PenghapusanCreated(id=await svc.create(payload))


@router.patch("/{penghapusan_id}", response_model=OkResponse)
async def update_penghapusan(
    penghapusan_id: str, payload: PenghapusanAsetUbah, svc: PenghapusanAsetService = Depends(get_service)
) -> OkResponse:
    """Edit selama berita acara bertanda tangan belum diunggah."""
    await svc.update(penghapusan_id, payload)
    return OkResponse()


@router.post("/{penghapusan_id}/batalkan", response_model=OkResponse)
async def batalkan_penghapusan(
    penghapusan_id: str,
    payload: BatalkanPenghapusanInput,
    svc: PenghapusanAsetService = Depends(get_service),
) -> OkResponse:
    await svc.batalkan(penghapusan_id, payload)
    return OkResponse()


@router.post("/{penghapusan_id}/bukti", response_model=OkResponse, status_code=201)
async def upload_bukti(
    penghapusan_id: str,
    file: UploadFile = File(...),
    svc: PenghapusanAsetService = Depends(get_service),
) -> OkResponse:
    data = await file.read()
    await svc.upload_bukti(penghapusan_id, data=data, content_type=file.content_type)
    return OkResponse()
