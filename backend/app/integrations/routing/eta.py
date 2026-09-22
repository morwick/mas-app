"""Prediksi ETA dari posisi truk terhadap polyline rute — matematika murni.

1. Decode polyline → titik-titik rute, hitung jarak kumulatif tiap titik.
2. Cari titik terdekat ke posisi truk (nearest-vertex; error <1% untuk
   polyline ORS yang rapat).
3. Sisa jarak = total − kumulatif di titik terdekat.
4. Sisa waktu = sisa jarak / kecepatan rata-rata ORS (fallback 40 km/j).

Truk yang berhenti tetap dianggap berjalan dengan kecepatan rata-rata: ETA
mundur sendiri bila sisa jarak tidak berkurang — itu memang yang diinginkan.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from pydantic import BaseModel

from app.core.timeutil import now_utc
from app.integrations.routing.polyline import decode_polyline

FALLBACK_AVG_SPEED_KMH = 40.0
EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


class EtaResult(BaseModel):
    remaining_km: float
    remaining_min: int
    predicted_arrival: datetime
    avg_speed_kmh: float


def compute_eta(
    *,
    truck_lat: float,
    truck_lng: float,
    polyline: str,
    route_distance_km: float | None,
    route_duration_min: float | None,
) -> EtaResult | None:
    points = decode_polyline(polyline)
    if len(points) < 2:
        return None

    cum_km = [0.0]
    for i in range(1, len(points)):
        cum_km.append(cum_km[i - 1] + haversine_km(*points[i - 1], *points[i]))
    total_km = cum_km[-1]

    nearest_idx = min(
        range(len(points)),
        key=lambda i: haversine_km(truck_lat, truck_lng, points[i][0], points[i][1]),
    )
    remaining_km = max(0.0, total_km - cum_km[nearest_idx])

    avg_speed = FALLBACK_AVG_SPEED_KMH
    if route_distance_km is not None and route_duration_min:
        avg_speed = route_distance_km / route_duration_min * 60

    remaining_min = remaining_km / avg_speed * 60
    return EtaResult(
        remaining_km=round(remaining_km, 1),
        remaining_min=round(remaining_min),
        predicted_arrival=now_utc() + timedelta(minutes=remaining_min),
        avg_speed_kmh=round(avg_speed, 1),
    )
