from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.modules.auth.schemas import OkResponse
from app.modules.uang_jalan.schemas import (
    JobUangJalan,
    SetPaguRequest,
    SumberDana,
    UangJalan,
    UangJalanInput,
    UangJalanJobRow,
)
from app.modules.uang_jalan.service import UangJalanService

router = APIRouter(tags=["uang-jalan"])


def get_service(client: AsyncClient = Depends(user_client)) -> UangJalanService:
    return UangJalanService(client)


@router.get("/sumber-dana", response_model=list[SumberDana])
async def list_sumber_dana(
    only_active: bool = Query(True), svc: UangJalanService = Depends(get_service)
) -> list[SumberDana]:
    return await svc.list_sumber_dana(only_active=only_active)


@router.get("/uang-jalan", response_model=list[UangJalanJobRow])
async def list_job_uang_jalan(
    hanya_belum_lunas: bool = Query(False),
    hanya_berjalan: bool = Query(False),
    svc: UangJalanService = Depends(get_service),
) -> list[UangJalanJobRow]:
    return await svc.list_jobs(hanya_belum_lunas=hanya_belum_lunas, hanya_berjalan=hanya_berjalan)


@router.get("/jobs/{job_id}/uang-jalan", response_model=JobUangJalan)
async def job_uang_jalan(job_id: str, svc: UangJalanService = Depends(get_service)) -> JobUangJalan:
    return await svc.job_summary(job_id)


@router.put("/jobs/{job_id}/uang-jalan/pagu", response_model=OkResponse)
async def set_pagu(job_id: str, payload: SetPaguRequest, svc: UangJalanService = Depends(get_service)) -> OkResponse:
    await svc.set_pagu(job_id, payload.pagu)
    return OkResponse()


@router.post("/uang-jalan", response_model=UangJalan, status_code=201)
async def create_uang_jalan(
    payload: UangJalanInput,
    auth: AuthContext = Depends(require_auth),
    svc: UangJalanService = Depends(get_service),
) -> UangJalan:
    return await svc.create(payload, created_by=auth.user.id)


@router.put("/uang-jalan/{uang_jalan_id}", response_model=OkResponse)
async def update_uang_jalan(
    uang_jalan_id: str, payload: UangJalanInput, svc: UangJalanService = Depends(get_service)
) -> OkResponse:
    await svc.update(uang_jalan_id, payload)
    return OkResponse()


@router.delete("/uang-jalan/{uang_jalan_id}", response_model=OkResponse)
async def delete_uang_jalan(uang_jalan_id: str, svc: UangJalanService = Depends(get_service)) -> OkResponse:
    await svc.delete(uang_jalan_id)
    return OkResponse()
