from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

IncidentType = Literal["kecelakaan", "kerusakan", "breakdown", "lainnya"]
IncidentStatus = Literal["open", "in_progress", "resolved"]


class IncidentPhoto(BaseModel):
    id: str
    incident_id: str
    file_path: str
    file_url: str
    uploaded_at: str


class Incident(BaseModel):
    id: str
    unit_id: str
    unit_kode: str | None = None
    job_id: str | None = None
    job_number: str | None = None
    tipe: IncidentType
    tanggal: str
    lokasi: str | None = None
    deskripsi: str
    biaya_repair: float | None = None
    vendor_repair: str | None = None
    status: IncidentStatus
    resolved_at: str | None = None
    created_by_nama: str | None = None
    created_at: str
    photos: list[IncidentPhoto] = Field(default_factory=list)


class IncidentCreate(BaseModel):
    unit_id: str = Field(min_length=1)
    job_id: str | None = None
    tipe: IncidentType
    tanggal: str = Field(min_length=1)
    lokasi: str | None = None
    deskripsi: str = Field(min_length=1)
    biaya_repair: float | None = None
    vendor_repair: str | None = None


class IncidentUpdate(BaseModel):
    job_id: str | None = None
    tipe: IncidentType | None = None
    tanggal: str | None = None
    lokasi: str | None = None
    deskripsi: str | None = None
    biaya_repair: float | None = None
    vendor_repair: str | None = None


class SetIncidentStatusRequest(BaseModel):
    status: IncidentStatus


class ResolveIncidentRequest(BaseModel):
    set_unit_to_standby: bool = False
