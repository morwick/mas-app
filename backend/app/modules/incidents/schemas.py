from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

IncidentType = Literal["kecelakaan", "kerusakan", "breakdown", "lainnya"]
IncidentStatus = Literal["open", "in_progress", "resolved"]
# Alasan insiden ditutup otomatis (Selesai) oleh sistem.
DitutupKarena = Literal["diafkirkan", "terjual"]


class IncidentPhoto(BaseModel):
    id: str
    incident_id: str
    file_path: str
    file_url: str
    uploaded_at: str


class Incident(BaseModel):
    id: str
    # Tepat satu terisi: insiden unit atau insiden unit trailer.
    unit_id: str | None = None
    unit_kode: str | None = None
    unit_trailer_id: str | None = None
    unit_trailer_kode: str | None = None
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
    # Ditutup otomatis (Selesai) karena aset diafkirkan / terjual; status sebelumnya.
    ditutup_karena: DitutupKarena | None = None
    status_sebelum_ditutup: IncidentStatus | None = None
    created_by_nama: str | None = None
    created_at: str
    photos: list[IncidentPhoto] = Field(default_factory=list)


class IncidentCreate(BaseModel):
    unit_id: str | None = None
    unit_trailer_id: str | None = None
    job_id: str | None = None
    tipe: IncidentType
    tanggal: str = Field(min_length=1)
    lokasi: str | None = None
    deskripsi: str = Field(min_length=1)
    biaya_repair: float | None = None
    vendor_repair: str | None = None

    @model_validator(mode="after")
    def _satu_aset(self) -> IncidentCreate:
        if bool(self.unit_id) == bool(self.unit_trailer_id):
            raise ValueError("Insiden harus untuk satu unit atau satu unit trailer")
        return self


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
