"""Catatan servis & kalibrasi odometer."""

from __future__ import annotations

from typing import Any

from supabase import AsyncClient

from app.core.pg import clean_text, first, num, rows
from app.modules.maintenance.schemas import CalibrateRequest, ServiceCreate, ServiceRecord
from app.modules.units.schemas import UnitWithService
from app.modules.units.service import UnitService

SERVICE_SELECT = """
  id, unit_id, tanggal, odometer_km, jenis, catatan, created_at,
  units(kode_unit),
  profiles!service_records_created_by_fkey(nama)
"""


def _to_record(r: dict[str, Any]) -> ServiceRecord:
    return ServiceRecord(
        id=r["id"],
        unit_id=r["unit_id"],
        unit_kode=(first(r.get("units")) or {}).get("kode_unit") or "",
        tanggal=r["tanggal"],
        odometer_km=num(r.get("odometer_km")),
        jenis=r["jenis"],
        catatan=r.get("catatan"),
        created_by_nama=(first(r.get("profiles")) or {}).get("nama") or "Sistem",
        created_at=r["created_at"],
    )


class MaintenanceService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def list_by_unit(self, unit_id: str) -> list[ServiceRecord]:
        res = await (
            self._db.table("service_records")
            .select(SERVICE_SELECT)
            .eq("unit_id", unit_id)
            .order("tanggal", desc=True)
            .execute()
        )
        return [_to_record(r) for r in rows(res)]

    async def last_service_odometer_map(self, unit_ids: list[str]) -> dict[str, float]:
        """MAX(odometer_km) per unit dalam satu round-trip — hindari N+1."""
        if not unit_ids:
            return {}
        res = await self._db.table("service_records").select("unit_id, odometer_km").in_("unit_id", unit_ids).execute()
        out: dict[str, float] = {}
        for r in rows(res):
            km = num(r.get("odometer_km"), default=float("nan"))
            if km != km:
                continue
            uid = r["unit_id"]
            if uid not in out or km > out[uid]:
                out[uid] = km
        return out

    async def units_with_service(self) -> list[UnitWithService]:
        units = await UnitService(self._db).list_all(include_inactive=False)
        last_map = await self.last_service_odometer_map([u.id for u in units])
        return [UnitWithService(**u.model_dump(), last_service_odometer_km=last_map.get(u.id)) for u in units]

    async def create(self, payload: ServiceCreate, *, created_by: str) -> ServiceRecord:
        res = await (
            self._db.table("service_records")
            .insert(
                {
                    "unit_id": payload.unit_id,
                    "tanggal": payload.tanggal,
                    "odometer_km": payload.odometer_km,
                    "jenis": payload.jenis,
                    "catatan": clean_text(payload.catatan),
                    "created_by": created_by,
                }
            )
            .execute()
        )
        record_id = rows(res)[0]["id"]
        full = await self._db.table("service_records").select(SERVICE_SELECT).eq("id", record_id).execute()
        return _to_record(rows(full)[0])

    async def delete(self, record_id: str) -> None:
        await self._db.table("service_records").delete().eq("id", record_id).execute()

    async def calibrate(self, payload: CalibrateRequest) -> None:
        await (
            self._db.table("units")
            .update({"odometer_baseline_km": payload.odometer_baseline_km})
            .eq("id", payload.unit_id)
            .execute()
        )
