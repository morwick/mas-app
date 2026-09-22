from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.domain.job_conflicts import ConflictCheckResult

JobStatus = Literal[
    "menunggu_pickup",
    "loading",
    "dalam_perjalanan",
    "unloading",
    "selesai",
    "cancelled",
]
PhotoType = Literal["loading", "unloading"]
JobListFilter = Literal["active", "selesai", "cancelled", "all"]

PHONE_RE = re.compile(r"^(08|\+628)\d{7,12}$")


class JobPhoto(BaseModel):
    id: str
    job_id: str
    type: PhotoType
    file_path: str
    file_url: str
    uploaded_at: str


class Job(BaseModel):
    id: str
    job_number: str
    share_token: str
    customer_id: str
    customer_nama: str
    pic_nama: str | None = None
    pic_no_hp: str | None = None
    alat_diangkut: str
    asal: str
    tujuan: str
    asal_lat: float | None = None
    asal_lng: float | None = None
    tujuan_lat: float | None = None
    tujuan_lng: float | None = None
    route_polyline: str | None = None
    route_distance_km: float | None = None
    route_duration_min: float | None = None
    # Borongan uang jalan yang disepakati di awal. Tidak dikirim ke halaman publik.
    uang_jalan_pagu: float | None = None
    unit_id: str
    driver_id: str
    etd: str
    eta: str | None = None
    status: JobStatus
    catatan: str | None = None
    cancelled_reason: str | None = None
    # Kapan driver menekan "Terima Job". None = belum dikonfirmasi.
    accepted_at: str | None = None
    # Bukti terima barang (e-POD).
    pod_penerima_nama: str | None = None
    pod_penerima_jabatan: str | None = None
    pod_signature_path: str | None = None
    pod_signature_url: str | None = None
    pod_catatan: str | None = None
    pod_at: str | None = None
    created_at: str
    completed_at: str | None = None
    quotation_id: str | None = None
    quotation_number: str | None = None
    photos: list[JobPhoto] = Field(default_factory=list)
    # Diisi hanya oleh portal driver / halaman publik.
    unit_kode: str | None = None
    unit_no_polisi: str | None = None


class JobStatusHistoryEntry(BaseModel):
    id: str
    job_id: str
    status_old: JobStatus | None
    status_new: JobStatus
    changed_by_nama: str
    changed_by_driver: bool
    changed_at: str
    notes: str | None = None


class _JobFields(BaseModel):
    pic_nama: str | None = None
    pic_no_hp: str | None = None
    asal_lat: float | None = None
    asal_lng: float | None = None
    tujuan_lat: float | None = None
    tujuan_lng: float | None = None
    eta: str | None = None
    catatan: str | None = None

    @field_validator("pic_no_hp")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return v
        if not PHONE_RE.match(v.strip()):
            raise ValueError("Format No HP PIC: 08xxxxxxxxxx atau +628xxxxxxxxxx")
        return v.strip()


class JobCreate(_JobFields):
    customer_id: str = Field(min_length=1)
    alat_diangkut: str = Field(min_length=1)
    asal: str = Field(min_length=1)
    tujuan: str = Field(min_length=1)
    unit_id: str = Field(min_length=1)
    driver_id: str = Field(min_length=1)
    etd: str = Field(min_length=1)
    # Diisi bila job lahir dari penawaran yang sudah deal.
    quotation_id: str | None = None
    # True bila admin sudah mengonfirmasi tetap simpan meski ada bentrok.
    allow_conflict: bool = False


class JobUpdate(_JobFields):
    customer_id: str | None = None
    alat_diangkut: str | None = None
    asal: str | None = None
    tujuan: str | None = None
    unit_id: str | None = None
    driver_id: str | None = None
    etd: str | None = None
    allow_conflict: bool = False


class JobCreated(BaseModel):
    id: str
    job_number: str
    share_token: str


class JobConflictResponse(BaseModel):
    """Dikirim sebagai 409 saat bentrok terdeteksi dan `allow_conflict` false."""

    detail: str
    conflicts: ConflictCheckResult


class UpdateStatusRequest(BaseModel):
    status: JobStatus
    notes: str | None = None


class CancelRequest(BaseModel):
    reason: str | None = None


class ConflictCheckRequest(BaseModel):
    unit_id: str
    driver_id: str
    etd: str
    eta: str | None = None
    exclude_job_id: str | None = None


class ActiveJobByUnit(BaseModel):
    unit_id: str
    job: Job
