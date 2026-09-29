"""Bantuan lokasi untuk pemilih titik di peta (form job)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.auth import AuthContext, require_auth
from app.core.errors import UpstreamError
from app.integrations.google_maps_link import resolve_link
from app.integrations.routing.openrouteservice import SegmenLaut, try_get_route

router = APIRouter(prefix="/geo", tags=["geo"])


class ResolveLinkResponse(BaseModel):
    url: str


class EstimasiRuteResponse(BaseModel):
    distance_km: float
    duration_min: float
    # False bila rute truk tidak ditemukan dan durasi berasal dari profil mobil.
    truk: bool
    # Penyeberangan kapal ferry (sudah termasuk di jarak & durasi total).
    laut: list[SegmenLaut] = []


@router.get("/resolve-link", response_model=ResolveLinkResponse)
async def resolve_maps_link(
    url: str = Query(..., max_length=2000, description="Link Google Maps (boleh link pendek maps.app.goo.gl)"),
    _auth: AuthContext = Depends(require_auth),
) -> ResolveLinkResponse:
    return ResolveLinkResponse(url=await resolve_link(url))


@router.get("/estimasi-rute", response_model=EstimasiRuteResponse)
async def estimasi_rute(
    asal_lat: float = Query(..., ge=-90, le=90),
    asal_lng: float = Query(..., ge=-180, le=180),
    tujuan_lat: float = Query(..., ge=-90, le=90),
    tujuan_lng: float = Query(..., ge=-180, le=180),
    _auth: AuthContext = Depends(require_auth),
) -> EstimasiRuteResponse:
    """Jarak & durasi perjalanan truk — pratinjau di form job sebelum disimpan."""
    route = await try_get_route(asal_lat, asal_lng, tujuan_lat, tujuan_lng)
    if route is None:
        raise UpstreamError(
            "Rute tidak ditemukan. Bila beda pulau, kemungkinan belum ada jalur kapal ferry "
            "yang terhubung di data peta."
        )
    return EstimasiRuteResponse(
        distance_km=route.distance_km, duration_min=route.duration_min, truk=route.truk, laut=route.laut
    )
