"""Master vendor (Master Data → Vendor). Akses mengikuti RLS (tulis: superadmin & admin)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import user_client
from app.core.paging import Page, PageParams, page_params
from app.modules.auth.schemas import OkResponse
from app.modules.vendors.schemas import Vendor, VendorCreate, VendorUpdate
from app.modules.vendors.service import VendorService

router = APIRouter(prefix="/vendors", tags=["vendors"])


def get_service(client: AsyncClient = Depends(user_client)) -> VendorService:
    return VendorService(client)


@router.get("/page", response_model=Page[Vendor])
async def list_vendors_page(
    include_inactive: bool = Query(False),
    q: str | None = Query(None, description="Cari nama perusahaan, kota, atau PIC"),
    params: PageParams = Depends(page_params),
    svc: VendorService = Depends(get_service),
) -> Page[Vendor]:
    return await svc.list_page(params=params, include_inactive=include_inactive, q=q)


@router.get("", response_model=list[Vendor])
async def list_vendors(
    include_inactive: bool = Query(False), svc: VendorService = Depends(get_service)
) -> list[Vendor]:
    """Tanpa potongan — untuk dropdown vendor."""
    return await svc.list_all(include_inactive=include_inactive)


@router.get("/{vendor_id}", response_model=Vendor)
async def get_vendor(vendor_id: str, svc: VendorService = Depends(get_service)) -> Vendor:
    return await svc.get(vendor_id)


@router.post("", response_model=Vendor, status_code=201)
async def create_vendor(payload: VendorCreate, svc: VendorService = Depends(get_service)) -> Vendor:
    return await svc.create(payload)


@router.patch("/{vendor_id}", response_model=OkResponse)
async def update_vendor(vendor_id: str, payload: VendorUpdate, svc: VendorService = Depends(get_service)) -> OkResponse:
    await svc.update(vendor_id, payload)
    return OkResponse()


@router.post("/{vendor_id}/deactivate", response_model=OkResponse)
async def deactivate_vendor(vendor_id: str, svc: VendorService = Depends(get_service)) -> OkResponse:
    await svc.deactivate(vendor_id)
    return OkResponse()
