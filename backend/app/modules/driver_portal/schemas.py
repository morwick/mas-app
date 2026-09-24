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
    status: JobStatus


class DriverUpdateStatusRequest(BaseModel):
    status: JobStatus
    notes: str | None = None


class DriverUpdateStatusResponse(BaseModel):
    status: JobStatus


class DeviceRegisterRequest(BaseModel):
    fcm_token: str = Field(min_length=10)
    platform: Literal["android", "ios", "web"] = "android"


class DriverNotification(BaseModel):
    id: str
    kind: str
    title: str
    body: str
    href: str | None = None
    job_id: str | None = None
    read_at: str | None = None
    created_at: str


class MarkReadRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)


# "active" & "all" dipakai portal web; tiga sisanya memetakan tab aplikasi
# mobile supaya penyaringannya di server, bukan setelah semua baris diunduh.
DriverJobFilter = Literal["active", "all", "konfirmasi", "aktif", "selesai"]
