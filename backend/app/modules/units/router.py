from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.paging import Page, PageParams, page_params
from app.core.auth import user_client
from app.modules.auth.schemas import OkResponse
from app.modules.incidents.schemas import Incident
from app.modules.incidents.service import IncidentService
from app.modules.jobs.schemas import Job
from app.modules.jobs.service import JobService
from app.modules.maintenance.schemas import ServiceRecord
from app.modules.maintenance.service import MaintenanceService
from app.modules.units.schemas import (
    ChangeStatusRequest,
    DriverAssignment,
    Unit,
    UnitCreate,
    UnitStatusHistoryEntry,
    UnitUpdate,
)
from app.modules.units.service import UnitService

router = APIRouter(prefix="/units", tags=["units"])


def get_service(client: AsyncClient = Depends(user_client)) -> UnitService:
    return UnitService(client)


@router.get("/page", response_model=Page[Unit])
async def list_units_page(
    include_inactive: bool = Query(False),
    q: str | None = Query(None, description="Cari kode unit atau nomor polisi"),
    jenis_unit_id: str | None = Query(None),
    status: str | None = Query(None),
    params: PageParams = Depends(page_params),
    svc: UnitService = Depends(get_service),
) -> Page[Unit]:
    return await svc.list_page(
        params=params, include_inactive=include_inactive, q=q,
        jenis_unit_id=jenis_unit_id, status=status,
    )


@router.get("", response_model=list[Unit])
async def list_units(
    include_inactive: bool = Query(False), svc: UnitService = Depends(get_service)
) -> list[Unit]:
    """Tanpa potongan — untuk dropdown pemilihan unit di form."""
    return await svc.list_all(include_inactive=include_inactive)


@router.get("/driver-assignments", response_model=dict[str, DriverAssignment])
async def driver_assignments(
    svc: UnitService = Depends(get_service),
) -> dict[str, DriverAssignment]:
    return await svc.driver_assignments()


@router.get("/{unit_id}", response_model=Unit)
async def get_unit(unit_id: str, svc: UnitService = Depends(get_service)) -> Unit:
    return await svc.get(unit_id)


@router.get("/{unit_id}/status-history", response_model=list[UnitStatusHistoryEntry])
async def status_history(unit_id: str, svc: UnitService = Depends(get_service)) -> list[UnitStatusHistoryEntry]:
    return await svc.status_history(unit_id)


@router.get("/{unit_id}/jobs", response_model=list[Job])
async def unit_jobs(unit_id: str, client: AsyncClient = Depends(user_client)) -> list[Job]:
    return await JobService(client).list_by_unit(unit_id)


@router.get("/{unit_id}/incidents", response_model=list[Incident])
async def unit_incidents(unit_id: str, client: AsyncClient = Depends(user_client)) -> list[Incident]:
    return await IncidentService(client).list_by_unit(unit_id)


@router.get("/{unit_id}/services", response_model=list[ServiceRecord])
async def unit_services(unit_id: str, client: AsyncClient = Depends(user_client)) -> list[ServiceRecord]:
    return await MaintenanceService(client).list_by_unit(unit_id)


@router.post("", response_model=Unit, status_code=201)
async def create_unit(payload: UnitCreate, svc: UnitService = Depends(get_service)) -> Unit:
    return await svc.create(payload)


@router.patch("/{unit_id}", response_model=OkResponse)
async def update_unit(unit_id: str, payload: UnitUpdate, svc: UnitService = Depends(get_service)) -> OkResponse:
    await svc.update(unit_id, payload)
    return OkResponse()


@router.post("/{unit_id}/status", response_model=OkResponse)
async def change_status(
    unit_id: str, payload: ChangeStatusRequest, svc: UnitService = Depends(get_service)
) -> OkResponse:
    await svc.change_status(unit_id, payload)
    return OkResponse()


@router.post("/{unit_id}/deactivate", response_model=OkResponse)
async def deactivate_unit(unit_id: str, svc: UnitService = Depends(get_service)) -> OkResponse:
    await svc.deactivate(unit_id)
    return OkResponse()
