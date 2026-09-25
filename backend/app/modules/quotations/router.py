from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, require_role, user_client
from app.modules.auth.schemas import OkResponse
from app.modules.quotations.schemas import (
    NextNumberResponse,
    Quotation,
    QuotationCreated,
    QuotationInput,
    QuotationJobRef,
    QuotationListRow,
    QuotationStatus,
    SetQuotationStatusRequest,
)
from app.modules.quotations.service import QuotationService

router = APIRouter(prefix="/quotations", tags=["quotations"])


def get_service(client: AsyncClient = Depends(user_client)) -> QuotationService:
    return QuotationService(client)


@router.get("", response_model=list[QuotationListRow])
async def list_quotations(
    status: QuotationStatus | None = Query(None),
    customer_id: str | None = Query(None),
    limit: int | None = Query(None, ge=1, le=500),
    svc: QuotationService = Depends(get_service),
) -> list[QuotationListRow]:
    return await svc.list_all(status=status, customer_id=customer_id, limit=limit)


@router.get("/next-number", response_model=NextNumberResponse)
async def next_number(svc: QuotationService = Depends(get_service)) -> NextNumberResponse:
    return NextNumberResponse(nomor=await svc.peek_next_number())


@router.get("/{quotation_id}", response_model=Quotation)
async def get_quotation(quotation_id: str, svc: QuotationService = Depends(get_service)) -> Quotation:
    return await svc.get(quotation_id)


@router.get("/{quotation_id}/jobs", response_model=list[QuotationJobRef])
async def quotation_jobs(quotation_id: str, svc: QuotationService = Depends(get_service)) -> list[QuotationJobRef]:
    return await svc.jobs_for(quotation_id)


@router.post("", response_model=QuotationCreated, status_code=201)
async def create_quotation(
    payload: QuotationInput,
    auth: AuthContext = Depends(require_auth),
    svc: QuotationService = Depends(get_service),
) -> QuotationCreated:
    return await svc.create(payload, created_by=auth.user.id)


@router.put("/{quotation_id}", response_model=OkResponse)
async def update_quotation(
    quotation_id: str, payload: QuotationInput, svc: QuotationService = Depends(get_service)
) -> OkResponse:
    await svc.update(quotation_id, payload)
    return OkResponse()


@router.post("/{quotation_id}/status", response_model=OkResponse)
async def set_status(
    quotation_id: str,
    payload: SetQuotationStatusRequest,
    svc: QuotationService = Depends(get_service),
) -> OkResponse:
    await svc.set_status(quotation_id, payload)
    return OkResponse()


@router.delete("/{quotation_id}", response_model=OkResponse, dependencies=[Depends(require_role("superadmin", "admin"))])
async def delete_quotation(quotation_id: str, svc: QuotationService = Depends(get_service)) -> OkResponse:
    await svc.delete(quotation_id)
    return OkResponse()
