from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import date

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import AuthContext, require_auth, user_client
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.integrations.tracksolid.client import TrackSolidClient, get_tracksolid
from app.modules.auth.schemas import OkResponse
from app.modules.maintenance.mileage import MileageService
from app.modules.maintenance.schemas import (
    CalibrateRequest,
    MileageAtResponse,
    MileageBatchResponse,
    ServiceCreate,
    ServiceRecord,
    SyncMileageResponse,
)
from app.modules.maintenance.service import MaintenanceService
from app.modules.units.schemas import UnitWithService

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


def get_service(client: AsyncClient = Depends(user_client)) -> MaintenanceService:
    return MaintenanceService(client)


async def admin_client(
    _: AuthContext = Depends(require_auth),
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> AsyncIterator[AsyncClient]:
    """Service role — hanya untuk menulis snapshot; pembacaan unit tetap lewat RLS."""
    async with factory.admin() as client:
        yield client


def get_mileage_service(
    user: AsyncClient = Depends(user_client),
    admin: AsyncClient = Depends(admin_client),
    tracksolid: TrackSolidClient = Depends(get_tracksolid),
) -> MileageService:
    return MileageService(user, admin, tracksolid)


@router.get("/units", response_model=list[UnitWithService])
async def units_with_service(
    svc: MaintenanceService = Depends(get_service),
) -> list[UnitWithService]:
    return await svc.units_with_service()


@router.post("/services", response_model=ServiceRecord, status_code=201)
async def create_service(
    payload: ServiceCreate,
    auth: AuthContext = Depends(require_auth),
    svc: MaintenanceService = Depends(get_service),
) -> ServiceRecord:
    return await svc.create(payload, created_by=auth.user.id)


@router.delete("/services/{record_id}", response_model=OkResponse)
async def delete_service(record_id: str, svc: MaintenanceService = Depends(get_service)) -> OkResponse:
    await svc.delete(record_id)
    return OkResponse()


@router.post("/calibrate", response_model=OkResponse)
async def calibrate(payload: CalibrateRequest, svc: MaintenanceService = Depends(get_service)) -> OkResponse:
    await svc.calibrate(payload)
    return OkResponse()


@router.get("/mileage", response_model=MileageBatchResponse)
async def sync_all_mileage(
    svc: MileageService = Depends(get_mileage_service),
) -> MileageBatchResponse:
    """Polling 5 menit dari halaman Service: sinkron hari ini + gap-fill semua unit."""
    return await svc.sync_all()


@router.post("/units/{unit_id}/sync-mileage", response_model=SyncMileageResponse)
async def sync_unit_mileage(unit_id: str, svc: MileageService = Depends(get_mileage_service)) -> SyncMileageResponse:
    return await svc.sync_one(unit_id)


@router.get("/units/{unit_id}/mileage-at", response_model=MileageAtResponse)
async def mileage_at(
    unit_id: str,
    date_: date = Query(..., alias="date"),
    svc: MileageService = Depends(get_mileage_service),
) -> MileageAtResponse:
    return await svc.mileage_at(unit_id, date_)
