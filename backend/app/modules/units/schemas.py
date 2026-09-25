from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# breakdown: ada insiden yang belum ditangani (migration 20260925000006).
# terjual / diafkirkan: unit keluar dari armada — tidak bisa dipakai job
# (migration 20260924000028 & 000029).
UnitStatus = Literal["standby", "bertugas", "breakdown", "perbaikan", "terjual", "diafkirkan"]
BUKAN_ARMADA: tuple[str, ...] = ("terjual", "diafkirkan")


class Unit(BaseModel):
    id: str
    kode_unit: str
    jenis_unit_id: str
    jenis_unit_nama: str
    no_polisi: str
    tahun: int | None = None
    status: UnitStatus
    catatan: str | None = None
    is_active: bool
    created_at: str
    default_driver_id: str | None = None
    default_driver_nama: str | None = None
    default_driver_no_hp: str | None = None
    imei_gps: str | None = None
    tracksolid_share_link: str | None = None
    # Odometer — default 0 untuk unit lama yang belum dikalibrasi.
    odometer_baseline_km: float = 0
    current_odometer_km: float = 0
    service_interval_km: float = 10_000
    # Dokumen kendaraan — tanggal saja (YYYY-MM-DD).
    stnk_nomor: str | None = None
    stnk_berlaku_sampai: str | None = None
    kir_nomor: str | None = None
    kir_berlaku_sampai: str | None = None
    pajak_berlaku_sampai: str | None = None


class UnitWithService(Unit):
    last_service_odometer_km: float | None = None


class UnitCreate(BaseModel):
    kode_unit: str = Field(min_length=1)
    jenis_unit_id: str = Field(min_length=1)
    no_polisi: str = Field(min_length=1)
    tahun: int | None = None
    status: UnitStatus = "standby"
    catatan: str | None = None
    default_driver_id: str | None = None
    imei_gps: str | None = None
    tracksolid_share_link: str | None = None
    stnk_nomor: str | None = None
    stnk_berlaku_sampai: str | None = None
    kir_nomor: str | None = None
    kir_berlaku_sampai: str | None = None
    pajak_berlaku_sampai: str | None = None


class UnitUpdate(BaseModel):
    kode_unit: str | None = None
    jenis_unit_id: str | None = None
    no_polisi: str | None = None
    tahun: int | None = None
    catatan: str | None = None
    default_driver_id: str | None = None
    imei_gps: str | None = None
    tracksolid_share_link: str | None = None
    stnk_nomor: str | None = None
    stnk_berlaku_sampai: str | None = None
    kir_nomor: str | None = None
    kir_berlaku_sampai: str | None = None
    pajak_berlaku_sampai: str | None = None


class ChangeStatusRequest(BaseModel):
    status: UnitStatus
    reason: str | None = None


class UnitStatusHistoryEntry(BaseModel):
    id: str
    unit_id: str
    status_old: UnitStatus | None
    status_new: UnitStatus
    changed_by_nama: str
    changed_at: str
    reason: str | None = None


class DriverAssignment(BaseModel):
    unit_id: str
    kode_unit: str


class UnitStatusCounts(BaseModel):
    standby: int = 0
    bertugas: int = 0
    breakdown: int = 0
    perbaikan: int = 0
    terjual: int = 0
    diafkirkan: int = 0
