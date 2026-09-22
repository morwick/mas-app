from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.modules.jobs.schemas import JobStatus


class DriverLoginRequest(BaseModel):
    no_hp: str = Field(min_length=1)
    pin: str = Field(pattern=r"^\d{6}$", description="PIN harus 6 angka")


class DriverSessionResponse(BaseModel):
    token: str
    driver_id: str
    nama: str
    no_hp: str
    expires_at: str | None = None


class DriverMeResponse(BaseModel):
    driver_id: str
    nama: str
    no_hp: str


class DriverAcceptResponse(BaseModel):
    accepted_at: str


class DriverUpdateStatusRequest(BaseModel):
    status: JobStatus
    notes: str | None = None


class DriverUpdateStatusResponse(BaseModel):
    status: JobStatus


class DriverPodRequest(BaseModel):
    penerima_nama: str = Field(min_length=1)
    penerima_jabatan: str | None = None
    catatan: str | None = None
    # PNG data URL dari kanvas tanda tangan di HP driver.
    signature_data_url: str | None = None


DriverJobFilter = Literal["active", "all"]
