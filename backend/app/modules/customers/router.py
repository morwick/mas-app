from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import user_client
from app.modules.auth.schemas import OkResponse
from app.modules.customers.schemas import Customer, CustomerCreate, CustomerUpdate
from app.modules.customers.service import CustomerService

router = APIRouter(prefix="/customers", tags=["customers"])


def get_service(client: AsyncClient = Depends(user_client)) -> CustomerService:
    return CustomerService(client)


@router.get("", response_model=list[Customer])
async def list_customers(
    include_inactive: bool = Query(False), svc: CustomerService = Depends(get_service)
) -> list[Customer]:
    return await svc.list_all(include_inactive=include_inactive)


@router.get("/job-counts", response_model=dict[str, int])
async def job_counts(svc: CustomerService = Depends(get_service)) -> dict[str, int]:
    return await svc.job_counts()


@router.get("/{customer_id}", response_model=Customer)
async def get_customer(customer_id: str, svc: CustomerService = Depends(get_service)) -> Customer:
    return await svc.get(customer_id)


@router.post("", response_model=Customer, status_code=201)
async def create_customer(payload: CustomerCreate, svc: CustomerService = Depends(get_service)) -> Customer:
    return await svc.create(payload)


@router.patch("/{customer_id}", response_model=OkResponse)
async def update_customer(
    customer_id: str, payload: CustomerUpdate, svc: CustomerService = Depends(get_service)
) -> OkResponse:
    await svc.update(customer_id, payload)
    return OkResponse()


@router.post("/{customer_id}/deactivate", response_model=OkResponse)
async def deactivate_customer(customer_id: str, svc: CustomerService = Depends(get_service)) -> OkResponse:
    await svc.deactivate(customer_id)
    return OkResponse()
