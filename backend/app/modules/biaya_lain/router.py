"""Biaya lain per job — kartu "Biaya Lain" di detail job.

Tanpa pembatasan role tambahan (sama dengan uang jalan): akses mengikuti RLS
cakupan job (staf aktif + can_access_job).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.modules.auth.schemas import OkResponse
from app.modules.biaya_lain.service import BiayaLain, BiayaLainCreate, BiayaLainInput, BiayaLainService

router = APIRouter(tags=["biaya-lain"])


def get_service(client: AsyncClient = Depends(user_client)) -> BiayaLainService:
    return BiayaLainService(client)


@router.get("/jobs/{job_id}/biaya-lain", response_model=list[BiayaLain])
async def list_biaya_lain_job(job_id: str, svc: BiayaLainService = Depends(get_service)) -> list[BiayaLain]:
    return await svc.list_job(job_id)


@router.post("/biaya-lain", response_model=BiayaLain, status_code=201)
async def create_biaya_lain(
    payload: BiayaLainCreate,
    auth: AuthContext = Depends(require_auth),
    svc: BiayaLainService = Depends(get_service),
) -> BiayaLain:
    return await svc.create(payload, created_by=auth.user.id)


@router.patch("/biaya-lain/{biaya_id}", response_model=BiayaLain)
async def update_biaya_lain(
    biaya_id: str,
    payload: BiayaLainInput,
    auth: AuthContext = Depends(require_auth),
    svc: BiayaLainService = Depends(get_service),
) -> BiayaLain:
    return await svc.update(biaya_id, payload, created_by=auth.user.id)


@router.delete("/biaya-lain/{biaya_id}", response_model=OkResponse)
async def delete_biaya_lain(biaya_id: str, svc: BiayaLainService = Depends(get_service)) -> OkResponse:
    await svc.delete(biaya_id)
    return OkResponse()
