from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from supabase import AsyncClient

from app.core.auth import user_client
from app.modules.auth.schemas import OkResponse
from app.modules.drivers.schemas import Driver, DriverCreate, DriverUpdate, SetPinRequest
from app.modules.drivers.service import DriverService

router = APIRouter(prefix="/drivers", tags=["drivers"])


def get_service(client: AsyncClient = Depends(user_client)) -> DriverService:
    return DriverService(client)


@router.get("", response_model=list[Driver])
async def list_drivers(
    include_inactive: bool = Query(False), svc: DriverService = Depends(get_service)
) -> list[Driver]:
    return await svc.list_all(include_inactive=include_inactive)


@router.get("/{driver_id}", response_model=Driver)
async def get_driver(driver_id: str, svc: DriverService = Depends(get_service)) -> Driver:
    return await svc.get(driver_id)


@router.post("", response_model=Driver, status_code=201)
async def create_driver(payload: DriverCreate, svc: DriverService = Depends(get_service)) -> Driver:
    return await svc.create(payload)


@router.patch("/{driver_id}", response_model=OkResponse)
async def update_driver(driver_id: str, payload: DriverUpdate, svc: DriverService = Depends(get_service)) -> OkResponse:
    await svc.update(driver_id, payload)
    return OkResponse()


@router.post("/{driver_id}/deactivate", response_model=OkResponse)
async def deactivate_driver(driver_id: str, svc: DriverService = Depends(get_service)) -> OkResponse:
    await svc.deactivate(driver_id)
    return OkResponse()


@router.post("/{driver_id}/pin", response_model=OkResponse)
async def set_driver_pin(
    driver_id: str, payload: SetPinRequest, svc: DriverService = Depends(get_service)
) -> OkResponse:
    await svc.set_pin(driver_id, payload.pin)
    return OkResponse()
