"""Status servis unit, diturunkan dari odometer — fungsi murni."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

DEFAULT_SERVICE_INTERVAL_KM = 10_000
WARNING_THRESHOLD_KM = 500

ServiceStatus = Literal["ok", "mendekati", "overdue"]


class DerivedServiceStatus(BaseModel):
    status: ServiceStatus
    next_service_at_km: float
    km_to_next_service: float
    km_since_last_service: float
    progress_percent: float


def derive_service_status(
    *,
    current_odometer_km: float,
    last_service_odometer_km: float | None,
    service_interval_km: float,
) -> DerivedServiceStatus:
    if service_interval_km <= 0:
        # Interval belum diisi → unit ini tidak dipantau (bukan "lewat jadwal").
        return DerivedServiceStatus(
            status="ok",
            next_service_at_km=0.0,
            km_to_next_service=0.0,
            km_since_last_service=0.0,
            progress_percent=0.0,
        )
    baseline = last_service_odometer_km or 0.0
    next_at = baseline + service_interval_km
    km_to_next = next_at - current_odometer_km
    km_since = max(0.0, current_odometer_km - baseline)
    progress = min(100.0, max(0.0, (km_since / service_interval_km) * 100)) if service_interval_km else 0.0
    status: ServiceStatus = (
        "overdue" if km_to_next <= 0 else "mendekati" if km_to_next <= WARNING_THRESHOLD_KM else "ok"
    )
    return DerivedServiceStatus(
        status=status,
        next_service_at_km=next_at,
        km_to_next_service=km_to_next,
        km_since_last_service=km_since,
        progress_percent=progress,
    )


def format_km(km: float) -> str:
    """`12.345 km` — pemisah ribuan gaya Indonesia."""
    return f"{int(round(km)):,}".replace(",", ".") + " km"
