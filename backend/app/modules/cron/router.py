"""Endpoint untuk penjadwal eksternal. Auth: `Authorization: Bearer <CRON_SECRET>`."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, Query, Request

from app.core.config import Settings, get_settings
from app.core.errors import UnauthorizedError
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.integrations.tracksolid.client import TrackSolidClient, get_tracksolid
from app.modules.maintenance.mileage import backfill_mileage
from app.modules.maintenance.schemas import BackfillSummary

router = APIRouter(prefix="/cron", tags=["cron"])


def verify_cron_secret(request: Request, settings: Settings = Depends(get_settings)) -> None:
    expected = settings.cron_secret
    provided = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not expected or not secrets.compare_digest(provided, expected):
        raise UnauthorizedError("Unauthorized")


@router.api_route(
    "/sync-mileage/backfill",
    methods=["GET", "POST"],
    response_model=BackfillSummary,
    dependencies=[Depends(verify_cron_secret)],
)
async def sync_mileage_backfill(
    days: int = Query(7, ge=1, le=60),
    unit_id: str | None = Query(None, alias="unitId"),
    force: bool = Query(False),
    factory: SupabaseClientFactory = Depends(get_client_factory),
    tracksolid: TrackSolidClient = Depends(get_tracksolid),
) -> BackfillSummary:
    async with factory.admin() as admin:
        return await backfill_mileage(admin, tracksolid, days=days, unit_id=unit_id, force=force)
