"""OpenRouteService — rute jalan antara dua titik.

Profil `driving-hgv` (truk) dipakai lebih dulu supaya durasi mengikuti
kecepatan truk. Bila ORS tidak menemukan rute truk (data OSM untuk truk kadang
bolong), jatuh ke `driving-car`. Geometry dikembalikan sebagai encoded polyline
supaya hemat saat disimpan.

API key gratis: https://openrouteservice.org/dev/#/signup (2000 req/hari).
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from cachetools import TTLCache
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import UpstreamError
from app.integrations.routing.eta import haversine_km
from app.integrations.routing.polyline import decode_polyline

log = logging.getLogger(__name__)

ENDPOINT = "https://api.openrouteservice.org/v2/directions/{profile}"
PROFIL_TRUK = "driving-hgv"
PROFIL_MOBIL = "driving-car"
# Rute antar pulau (mis. Jakarta–Balikpapan) bisa lebih dari 10 detik dihitung ORS.
TIMEOUT_S = 20.0

# Bit "ferries" pada extra_info `waycategory` ORS.
_WAYCATEGORY_FERRY = 8

# Rute yang sama diminta dua kali saat membuat job: pratinjau di form lalu saat
# simpan. Cache singkat menghemat kuota ORS (2000 req/hari).
_CACHE: TTLCache[tuple[float, float, float, float], RouteResult] = TTLCache(maxsize=256, ttl=30 * 60)


class RoutePoint(BaseModel):
    lat: float
    lng: float


class SegmenLaut(BaseModel):
    """Satu penyeberangan kapal ferry di dalam rute."""

    nama: str | None = None  # mis. "Surabaya - Banjarmasin" (dari data OSM, kadang kosong)
    distance_km: float
    duration_min: float


class RouteResult(BaseModel):
    polyline: str
    distance_km: float
    duration_min: float
    # False bila rute truk tidak ditemukan dan durasi berasal dari profil mobil.
    truk: bool = True
    # Penyeberangan laut di dalam rute; kosong bila seluruhnya jalur darat.
    laut: list[SegmenLaut] = []


def _segmen_laut(route: dict[str, Any]) -> list[SegmenLaut]:
    """Pisahkan bagian ferry dari rute ORS.

    ORS menandai titik-titik geometry yang berada di kapal lewat extra_info
    `waycategory`. Jaraknya dihitung dari titik-titik itu; durasinya diambil
    dari langkah (step) rute sebanding dengan porsi titik ferry di tiap langkah.
    """
    nilai = ((route.get("extras") or {}).get("waycategory") or {}).get("values") or []
    rentang = [(int(a), int(b)) for a, b, v in nilai if int(v) & _WAYCATEGORY_FERRY and b > a]
    if not rentang:
        return []

    titik = decode_polyline(route["geometry"])
    steps = [st for seg in route.get("segments") or [] for st in seg.get("steps") or []]
    out: list[SegmenLaut] = []
    for a, b in rentang:
        jarak = sum(haversine_km(*titik[i], *titik[i + 1]) for i in range(a, min(b, len(titik) - 1)))
        durasi = 0.0
        nama: str | None = None
        for st in steps:
            s0, s1 = st.get("way_points") or (0, 0)
            irisan = min(s1, b) - max(s0, a)
            if irisan <= 0 or s1 <= s0:
                continue
            durasi += float(st.get("duration") or 0) * irisan / (s1 - s0)
            n = (st.get("name") or "").strip()
            if n and n != "-" and nama is None:
                nama = n
        out.append(SegmenLaut(nama=nama, distance_km=round(jarak, 1), duration_min=round(durasi / 60, 1)))
    return out


async def get_route(origin: RoutePoint, destination: RoutePoint, *, profile: str = PROFIL_TRUK) -> RouteResult:
    api_key = get_settings().openrouteservice_api_key
    if not api_key:
        raise UpstreamError("OPENROUTESERVICE_API_KEY belum di-set di environment")

    async with httpx.AsyncClient(timeout=TIMEOUT_S) as http:
        res = await http.post(
            ENDPOINT.format(profile=profile),
            headers={
                "Authorization": api_key,
                "Content-Type": "application/json",
                "Accept": "application/json, application/geo+json",
            },
            json={
                "coordinates": [
                    [origin.lng, origin.lat],
                    [destination.lng, destination.lat],
                ],
                # Untuk memisahkan penyeberangan kapal ferry dari jalur darat.
                "extra_info": ["waycategory"],
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
        truk=profile == PROFIL_TRUK,
        laut=_segmen_laut(route),
    )


async def try_get_route(
    asal_lat: float | None,
    asal_lng: float | None,
    tujuan_lat: float | None,
    tujuan_lng: float | None,
) -> RouteResult | None:
    """Ambil rute truk (cadangan: mobil); non-fatal bila gagal. Job tetap disimpan tanpa polyline."""
    if asal_lat is None or asal_lng is None or tujuan_lat is None or tujuan_lng is None:
        return None
    kunci = (round(asal_lat, 5), round(asal_lng, 5), round(tujuan_lat, 5), round(tujuan_lng, 5))
    if (hasil := _CACHE.get(kunci)) is not None:
        return hasil

    asal = RoutePoint(lat=asal_lat, lng=asal_lng)
    tujuan = RoutePoint(lat=tujuan_lat, lng=tujuan_lng)
    for profile in (PROFIL_TRUK, PROFIL_MOBIL):
        try:
            hasil = await get_route(asal, tujuan, profile=profile)
        except Exception as exc:  # noqa: BLE001 — polyline hanya visual, jangan gagalkan simpan
            log.warning("[ORS] fetch route %s gagal: %s", profile, exc)
            continue
        _CACHE[kunci] = hasil
        return hasil
    return None
