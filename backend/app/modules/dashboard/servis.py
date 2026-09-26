"""Monitoring servis unit untuk kartu "Perlu tindakan" di dashboard (bukan
notifikasi): unit yang servisnya sudah lewat jadwal dan yang mendekati jadwal
(sisa km di bawah ambang peringatan).
"""

from __future__ import annotations

from pydantic import BaseModel
from supabase import AsyncClient

from app.domain.service_status import derive_service_status
from app.modules.maintenance.service import MaintenanceService


class ServisUnit(BaseModel):
    unit_id: str
    kode_unit: str
    href: str
    # Lewat jadwal: sudah berapa km melewati. Mendekati: sisa km menuju servis.
    km: float


class MonitoringServis(BaseModel):
    lewat_jadwal: list[ServisUnit] = []
    mendekati: list[ServisUnit] = []


async def monitoring_servis(db: AsyncClient) -> MonitoringServis:
    """Sumber & aturan sama persis dengan menu Service (MaintenanceService.
    units_with_service + derive_service_status). Lewat jadwal: paling jauh
    melewati dulu. Mendekati: sisa km paling sedikit dulu."""
    units = await MaintenanceService(db).units_with_service()
    hasil = MonitoringServis()
    for u in units:
        derived = derive_service_status(
            current_odometer_km=u.current_odometer_km or 0,
            last_service_odometer_km=u.last_service_odometer_km,
            service_interval_km=u.service_interval_km or 0,
        )
        unit = ServisUnit(
            unit_id=u.id,
            kode_unit=u.kode_unit,
            href=f"/units/{u.id}?tab=service",
            km=abs(derived.km_to_next_service),
        )
        if derived.status == "overdue":
            hasil.lewat_jadwal.append(unit)
        elif derived.status == "mendekati":
            hasil.mendekati.append(unit)
    hasil.lewat_jadwal.sort(key=lambda s: -s.km)
    hasil.mendekati.sort(key=lambda s: s.km)
    return hasil
