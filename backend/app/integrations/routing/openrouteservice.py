"""OpenRouteService — rute jalan antara dua titik.

Profil `driving-car`: cakupan jalan paling lengkap di Indonesia (data OSM untuk
`hgv` banyak bolong di luar Jawa). Untuk rute antar kota, truk lowbed umumnya
lewat jalan yang sama dengan mobil. Geometry dikembalikan sebagai encoded
polyline supaya hemat saat disimpan.

API key gratis: https://openrouteservice.org/dev/#/signup (2000 req/hari).
"""

from __future__ import annotations

import logging

import httpx
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import UpstreamError

log = logging.getLogger(__name__)

ENDPOINT = "https://api.openrouteservice.org/v2/directions/driving-car"
TIMEOUT_S = 10.0


class RoutePoint(BaseModel):
    lat: float
    lng: float


class RouteResult(BaseModel):
    polyline: str
    distance_km: float
    duration_min: float


async def get_route(origin: RoutePoint, destination: RoutePoint) -> RouteResult:
    api_key = get_settings().openrouteservice_api_key
    if not api_key:
        raise UpstreamError("OPENROUTESERVICE_API_KEY belum di-set di environment")

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as http:
        res = await http.post(
            ENDPOINT,
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json, application/geo+json",
            },
            json={
                "coordinates": [
                    [origin.lng, origin.lat],
                    [destination.lng, destination.lat],
                ]
            },
        )

    if res.status_code >= 400:
        raise UpstreamError(f"ORS HTTP {res.status_code}: {res.text[:200]}")

    body = res.json()
    if body.get("error"):
        err = body["error"]
        message = err if isinstance(err, str) else err.get("message", "ORS error")
        raise UpstreamError(f"ORS: {message}")

    routes = body.get("routes") or []
    route = routes[0] if routes else None
    if not route or not route.get("geometry"):
        raise UpstreamError("ORS: tidak ada rute yang ditemukan")

    summary = route["summary"]
    return RouteResult(
        polyline=route["geometry"],
        distance_km=round(summary["distance"] / 100) / 10,
        duration_min=round(summary["duration"] / 60 * 10) / 10,
    )


async def try_get_route(
    asal_lat: float | None,
    asal_lng: float | None,
    tujuan_lat: float | None,
    tujuan_lng: float | None,
) -> RouteResult | None:
    """Ambil rute; non-fatal bila gagal. Job tetap disimpan tanpa polyline."""
    if None in (asal_lat, asal_lng, tujuan_lat, tujuan_lng):
        return None
    try:
        return await get_route(
            RoutePoint(lat=asal_lat, lng=asal_lng),  # type: ignore[arg-type]
            RoutePoint(lat=tujuan_lat, lng=tujuan_lng),  # type: ignore[arg-type]
        )
    except Exception as exc:  # noqa: BLE001 — polyline hanya visual, jangan gagalkan simpan
        log.warning("[ORS] fetch route gagal: %s", exc)
        return None
