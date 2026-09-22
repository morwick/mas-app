from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import AuthContext, owner_client, require_auth, user_client
from app.modules.auth.schemas import OkResponse
from app.modules.invoices.schemas import (
    Invoice,
    InvoiceCreated,
    InvoiceInput,
    InvoiceListRow,
    InvoiceStatus,
    JobBelumDitagihRow,
    PaymentInput,
    PiutangSummaryRow,
    SetInvoiceStatusRequest,
)
from app.modules.invoices.service import InvoiceService
from app.modules.quotations.schemas import NextNumberResponse

router = APIRouter(tags=["invoices"])


def get_service(client: AsyncClient = Depends(user_client)) -> InvoiceService:
    return InvoiceService(client)


@router.get("/invoices", response_model=list[InvoiceListRow])
async def list_invoices(
    status: InvoiceStatus | None = Query(None),
    customer_id: str | None = Query(None),
    limit: int | None = Query(None, ge=1, le=500),
    svc: InvoiceService = Depends(get_service),
) -> list[InvoiceListRow]:
    return await svc.list_all(status=status, customer_id=customer_id, limit=limit)


@router.get("/invoices/next-number", response_model=NextNumberResponse)
async def next_number(svc: InvoiceService = Depends(get_service)) -> NextNumberResponse:
    return NextNumberResponse(nomor=await svc.peek_next_number())


@router.get("/invoices/jobs-belum-ditagih", response_model=dict[str, list[JobBelumDitagihRow]])
async def jobs_belum_ditagih(
    customer_id: str | None = Query(None), svc: InvoiceService = Depends(get_service)
) -> dict[str, list[JobBelumDitagihRow]]:
    return await svc.jobs_belum_ditagih(customer_id)


@router.get("/invoices/{invoice_id}", response_model=Invoice)
async def get_invoice(invoice_id: str, svc: InvoiceService = Depends(get_service)) -> Invoice:
    return await svc.get(invoice_id)


@router.post("/invoices", response_model=InvoiceCreated, status_code=201)
async def create_invoice(
    payload: InvoiceInput,
    auth: AuthContext = Depends(require_auth),
    svc: InvoiceService = Depends(get_service),
) -> InvoiceCreated:
    return await svc.create(payload, created_by=auth.user.id)


@router.put("/invoices/{invoice_id}", response_model=OkResponse)
async def update_invoice(
    invoice_id: str, payload: InvoiceInput, svc: InvoiceService = Depends(get_service)
) -> OkResponse:
    await svc.update(invoice_id, payload)
    return OkResponse()


@router.post("/invoices/{invoice_id}/status", response_model=OkResponse)
async def set_status(
    invoice_id: str, payload: SetInvoiceStatusRequest, svc: InvoiceService = Depends(get_service)
) -> OkResponse:
    await svc.set_status(invoice_id, payload)
    return OkResponse()


@router.post("/invoices/{invoice_id}/payments", response_model=OkResponse, status_code=201)
async def add_payment(
    invoice_id: str,
    payload: PaymentInput,
    auth: AuthContext = Depends(require_auth),
    svc: InvoiceService = Depends(get_service),
) -> OkResponse:
    await svc.add_payment(invoice_id, payload, created_by=auth.user.id)
    return OkResponse()


@router.delete("/invoices/{invoice_id}/payments/{payment_id}", response_model=OkResponse)
async def delete_payment(invoice_id: str, payment_id: str, svc: InvoiceService = Depends(get_service)) -> OkResponse:
    await svc.delete_payment(payment_id)
    return OkResponse()


@router.delete("/invoices/{invoice_id}", response_model=OkResponse)
async def delete_invoice(invoice_id: str, svc: InvoiceService = Depends(get_service)) -> OkResponse:
    await svc.delete(invoice_id)
    return OkResponse()


@router.get("/piutang/summary", response_model=list[PiutangSummaryRow])
async def piutang_summary(client: AsyncClient = Depends(owner_client)) -> list[PiutangSummaryRow]:
    return await InvoiceService(client).piutang_summary()
