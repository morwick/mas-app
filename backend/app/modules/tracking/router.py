from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends
from supabase import AsyncClient

from app.core.auth import user_client
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.integrations.tracksolid.client import TrackSolidClient, get_tracksolid
from app.modules.tracking.schemas import (
    FleetLocationsResponse,
    LocationEntry,
    PublicTrackingResponse,
)
from app.modules.tracking.service import FleetTrackingService, PublicTrackingService

router = APIRouter(tags=["tracking"])


def get_fleet_service(
    client: AsyncClient = Depends(user_client),
    tracksolid: TrackSolidClient = Depends(get_tracksolid),
) -> FleetTrackingService:
    return FleetTrackingService(client, tracksolid)


async def share_client(
    token: str, factory: SupabaseClientFactory = Depends(get_client_factory)
) -> AsyncIterator[AsyncClient]:
    async with factory.anonymous(share_token=token) as client:
        yield client


def get_public_service(
    client: AsyncClient = Depends(share_client),
    tracksolid: TrackSolidClient = Depends(get_tracksolid),
) -> PublicTrackingService:
    return PublicTrackingService(client, tracksolid)


# ── Admin ───────────────────────────────────────────────────────────────────


@router.get("/tracking/units/locations", response_model=FleetLocationsResponse)
async def fleet_locations(
    svc: FleetTrackingService = Depends(get_fleet_service),
) -> FleetLocationsResponse:
    return await svc.all_locations()


@router.get("/tracking/units/{unit_id}/location", response_model=LocationEntry)
async def unit_location(unit_id: str, svc: FleetTrackingService = Depends(get_fleet_service)) -> LocationEntry:
    return await svc.unit_location(unit_id)


# ── Publik (pelanggan, tanpa login) ─────────────────────────────────────────


@router.get("/track/{token}", response_model=PublicTrackingResponse)
async def public_tracking(
    token: str, svc: PublicTrackingService = Depends(get_public_service)
) -> PublicTrackingResponse:
    return await svc.get(token)


@router.get("/track/{token}/location", response_model=LocationEntry)
async def public_location(token: str, svc: PublicTrackingService = Depends(get_public_service)) -> LocationEntry:
    return await svc.location(token)
