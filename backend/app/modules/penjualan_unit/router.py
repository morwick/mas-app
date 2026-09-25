from __future__ import annotations

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel
from supabase import AsyncClient

from app.core.auth import superadmin_client
from app.core.paging import Page, PageParams, page_params
from app.modules.auth.schemas import OkResponse
from app.modules.penjualan_unit.schemas import AsetTerjual, JenisAset, PenjualanUnit, PenjualanUnitInput
from app.modules.penjualan_unit.service import PenjualanUnitService

router = APIRouter(prefix="/penjualan-unit", tags=["penjualan-unit"])


class PenjualanCreated(BaseModel):
    id: str


def get_service(client: AsyncClient = Depends(superadmin_client)) -> PenjualanUnitService:
    return PenjualanUnitService(client)


@router.get("", response_model=Page[PenjualanUnit])
async def list_penjualan(
    q: str | None = Query(None, description="Cari nama pembeli"),
    jenis_aset: JenisAset | None = Query(None),
    params: PageParams = Depends(page_params),
    svc: PenjualanUnitService = Depends(get_service),
) -> Page[PenjualanUnit]:
    return await svc.list_page(params=params, q=q, jenis_aset=jenis_aset)


@router.get("/aset-pilihan", response_model=list[AsetTerjual])
async def aset_pilihan(
    jenis_aset: JenisAset = Query(...),
    svc: PenjualanUnitService = Depends(get_service),
) -> list[AsetTerjual]:
    """Unit/unit trailer berstatus Standby — dropdown pemilihan di form penjualan."""
    return await svc.aset_pilihan(jenis_aset)


@router.get("/{penjualan_id}", response_model=PenjualanUnit)
async def get_penjualan(penjualan_id: str, svc: PenjualanUnitService = Depends(get_service)) -> PenjualanUnit:
    return await svc.get(penjualan_id)


@router.post("", response_model=PenjualanCreated, status_code=201)
async def create_penjualan(
    payload: PenjualanUnitInput, svc: PenjualanUnitService = Depends(get_service)
) -> PenjualanCreated:
    penjualan_id = await svc.create(payload)
    return PenjualanCreated(id=penjualan_id)


@router.post("/{penjualan_id}/batalkan", response_model=OkResponse)
async def batalkan_penjualan(penjualan_id: str, svc: PenjualanUnitService = Depends(get_service)) -> OkResponse:
    await svc.batalkan(penjualan_id)
    return OkResponse()


@router.post("/{penjualan_id}/bukti", response_model=OkResponse, status_code=201)
async def upload_bukti(
    penjualan_id: str,
    file: UploadFile = File(...),
    svc: PenjualanUnitService = Depends(get_service),
) -> OkResponse:
    data = await file.read()
    await svc.upload_bukti(penjualan_id, data=data, content_type=file.content_type)
    return OkResponse()
