from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

JenisService = Literal["rutin", "oli", "ban", "mesin", "lainnya"]


class ServiceRecord(BaseModel):
    id: str
    unit_id: str
    unit_kode: str
    tanggal: str
    odometer_km: float
    jenis: JenisService
    catatan: str | None = None
    created_by_nama: str
    created_at: str


class ServiceCreate(BaseModel):
    unit_id: str = Field(min_length=1)
    tanggal: str = Field(min_length=1, description="YYYY-MM-DD")
    odometer_km: float = Field(ge=0)
    jenis: JenisService
    catatan: str | None = None


class CalibrateRequest(BaseModel):
    unit_id: str = Field(min_length=1)
    odometer_baseline_km: float = Field(ge=0)


class MileageEntry(BaseModel):
    km: float
    fetched_at: str


class MileageBatchResponse(BaseModel):
    daily: dict[str, MileageEntry | None]
    odometers: dict[str, float]


class SyncMileageResponse(BaseModel):
    ok: bool = True
    km: float
    current_odometer_km: float | None


DataQuality = Literal["complete", "partial", "no_data"]


class MileageAtResponse(BaseModel):
    ok: bool = True
    date: str
    akumulasi_km: int | None
    current_akumulasi_km: int
    km_after_target: int | None
    data_quality: DataQuality
    missing_days: list[str]
    earliest_snapshot_date: str | None


class BackfillFailure(BaseModel):
    unit_id: str
    tanggal: str
    reason: str


class BackfillSummary(BaseModel):
    ok: bool = True
    days: int
    units: int
    inserted: int = 0
    skipped: int = 0
    failed: int = 0
    failures: list[BackfillFailure] = Field(default_factory=list)
