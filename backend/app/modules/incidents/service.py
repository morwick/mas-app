from __future__ import annotations

from typing import Any

from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError, ValidationError
from app.core.pg import clean_text, first, num_or_none, rows, single
from app.core.storage import (
    remove_object_quietly,
    unique_object_name,
    upload_object,
    validate_photo,
)
from app.core.supabase import storage_public_url
from app.core.timeutil import iso_utc, parse_iso
from app.modules.incidents.schemas import (
    Incident,
    IncidentCreate,
    IncidentPhoto,
    IncidentStatus,
    IncidentUpdate,
)

INCIDENT_SELECT = """
  id, unit_id, job_id, tipe, tanggal, lokasi, deskripsi,
  biaya_repair, vendor_repair, status, resolved_at, created_at,
  unit:units(kode_unit),
  job:jobs(job_number),
  creator:profiles(nama),
  photos:incident_photos(id, file_path, uploaded_at)
"""


def _bucket() -> str:
    return get_settings().incident_photos_bucket


def to_incident(row: dict[str, Any]) -> Incident:
    return Incident(
        id=row["id"],
        unit_id=row["unit_id"],
        unit_kode=(first(row.get("unit")) or {}).get("kode_unit"),
        job_id=row.get("job_id"),
        job_number=(first(row.get("job")) or {}).get("job_number"),
        tipe=row["tipe"],
        tanggal=row["tanggal"],
        lokasi=row.get("lokasi"),
        deskripsi=row["deskripsi"],
        biaya_repair=num_or_none(row.get("biaya_repair")),
        vendor_repair=row.get("vendor_repair"),
        status=row["status"],
        resolved_at=row.get("resolved_at"),
        created_by_nama=(first(row.get("creator")) or {}).get("nama"),
        created_at=row["created_at"],
        photos=[
            IncidentPhoto(
                id=p["id"],
                incident_id=row["id"],
                file_path=p["file_path"],
                file_url=storage_public_url(_bucket(), p["file_path"]),
                uploaded_at=p["uploaded_at"],
            )
            for p in (row.get("photos") or [])
        ],
    )


class IncidentService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def list_by_unit(self, unit_id: str) -> list[Incident]:
        res = await (
            self._db.table("incident_logs")
            .select(INCIDENT_SELECT)
            .eq("unit_id", unit_id)
            .order("tanggal", desc=True)
            .execute()
        )
        return [to_incident(r) for r in rows(res)]

    async def get(self, incident_id: str) -> Incident:
        row = single(
            await self._db.table("incident_logs").select(INCIDENT_SELECT).eq("id", incident_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Insiden tidak ditemukan")
        return to_incident(row)

    async def create(self, payload: IncidentCreate, *, created_by: str | None) -> Incident:
        if not payload.deskripsi.strip():
            raise ValidationError("Deskripsi wajib diisi")
        res = await (
            self._db.table("incident_logs")
            .insert(
                {
                    "unit_id": payload.unit_id,
                    "job_id": payload.job_id or None,
                    "tipe": payload.tipe,
                    "tanggal": iso_utc(parse_iso(payload.tanggal)),
                    "lokasi": clean_text(payload.lokasi),
                    "deskripsi": payload.deskripsi.strip(),
                    "biaya_repair": payload.biaya_repair,
                    "vendor_repair": clean_text(payload.vendor_repair),
                    "created_by": created_by,
                }
            )
            .execute()
        )
        return await self.get(rows(res)[0]["id"])

    async def update(self, incident_id: str, payload: IncidentUpdate) -> None:
        fields = payload.model_dump(exclude_unset=True)
        data: dict[str, Any] = {}
        if fields.get("tipe"):
            data["tipe"] = fields["tipe"]
        if fields.get("tanggal"):
            data["tanggal"] = iso_utc(parse_iso(fields["tanggal"]))
        if "lokasi" in fields:
            data["lokasi"] = clean_text(fields["lokasi"])
        if fields.get("deskripsi"):
            data["deskripsi"] = fields["deskripsi"].strip()
        if "biaya_repair" in fields:
            data["biaya_repair"] = fields["biaya_repair"]
        if "vendor_repair" in fields:
            data["vendor_repair"] = clean_text(fields["vendor_repair"])
        if "job_id" in fields:
            data["job_id"] = fields["job_id"] or None
        if data:
            await self._db.table("incident_logs").update(data).eq("id", incident_id).execute()

    async def set_status(self, incident_id: str, status: IncidentStatus) -> None:
        await self._db.table("incident_logs").update({"status": status}).eq("id", incident_id).execute()

    async def resolve(self, incident_id: str, *, set_unit_to_standby: bool) -> None:
        res = await self._db.table("incident_logs").update({"status": "resolved"}).eq("id", incident_id).execute()
        updated = rows(res)
        unit_id = updated[0].get("unit_id") if updated else None
        if set_unit_to_standby and unit_id:
            await self._db.table("units").update({"status": "standby"}).eq("id", unit_id).execute()

    async def delete(self, incident_id: str) -> None:
        await self._db.table("incident_logs").delete().eq("id", incident_id).execute()

    async def upload_photo(
        self,
        *,
        incident_id: str,
        data: bytes,
        content_type: str | None,
        uploaded_by: str | None,
    ) -> IncidentPhoto:
        ext = validate_photo(content_type, len(data))
        path = f"{incident_id}/{unique_object_name(ext)}"
        await upload_object(self._db, _bucket(), path, data, content_type or "image/jpeg")
        try:
            res = await (
                self._db.table("incident_photos")
                .insert(
                    {
                        "incident_id": incident_id,
                        "file_path": path,
                        "file_size": len(data),
                        "uploaded_by": uploaded_by,
                    }
                )
                .execute()
            )
        except Exception:
            await remove_object_quietly(self._db, _bucket(), path)
            raise
        row = rows(res)[0]
        return IncidentPhoto(
            id=row["id"],
            incident_id=incident_id,
            file_path=path,
            file_url=storage_public_url(_bucket(), path),
            uploaded_at=row["uploaded_at"],
        )

    async def delete_photo(self, photo_id: str) -> None:
        row = single(
            await self._db.table("incident_photos").select("id, file_path").eq("id", photo_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Foto tidak ditemukan")
        await self._db.table("incident_photos").delete().eq("id", photo_id).execute()
        await remove_object_quietly(self._db, _bucket(), row["file_path"])
