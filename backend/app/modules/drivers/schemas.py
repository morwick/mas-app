from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PHONE_RE = re.compile(r"^(08|\+628)\d{7,12}$")

DriverStatus = Literal["stand_by", "in_job"]


class Driver(BaseModel):
    id: str
    # Nama driver = nama karyawan (diisi database dari hr.karyawan).
    nama: str
    karyawan_id: str | None = None
    no_hp: str
    no_sim: str | None = None
    # Tanggal habis berlaku SIM (YYYY-MM-DD). None = belum dicatat.
    sim_berlaku_sampai: str | None = None
    # Dokumen SIM (opsional). `sim_url` = signed URL, hanya terisi di detail driver.
    sim_uploaded_at: str | None = None
    sim_url: str | None = None
    alamat: str | None = None
    catatan: str | None = None
    is_active: bool
    created_at: str
    # Kapan PIN portal terakhir di-set. None = driver belum bisa login.
    pin_updated_at: str | None = None
    # BR-01: diturunkan dari job aktif — bukan kolom tersimpan.
    status: DriverStatus = "stand_by"
    active_job_id: str | None = None
    active_job_number: str | None = None
    # Karyawan pemilik data driver ini di-blacklist (migration 20261001000004).
    is_blacklist: bool = False
    blacklist_alasan: str | None = None
    blacklist_at: str | None = None
    blacklist_oleh_nama: str | None = None


class DriverCreate(BaseModel):
    # Driver dipilih dari data karyawan; nama mengikuti karyawan.
    karyawan_id: str = Field(min_length=1)
    no_hp: str = Field(min_length=1)
    no_sim: str | None = None
    sim_berlaku_sampai: str | None = None
    alamat: str | None = None
    catatan: str | None = None

    @field_validator("no_hp")
    @classmethod
    def _phone(cls, v: str) -> str:
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("Format No HP: 08xxxxxxxxxx atau +628xxxxxxxxxx")
        return v


class DriverUpdate(BaseModel):
    karyawan_id: str | None = None
    no_hp: str | None = None
    no_sim: str | None = None
    sim_berlaku_sampai: str | None = None
    alamat: str | None = None
    catatan: str | None = None
    # True = dokumen SIM yang tersimpan dilepas (diabaikan bila ada file baru).
    hapus_dokumen_sim: bool = False

    @field_validator("no_hp")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not PHONE_RE.match(v):
            raise ValueError("Format No HP: 08xxxxxxxxxx atau +628xxxxxxxxxx")
        return v


class SetPinRequest(BaseModel):
    pin: str = Field(pattern=r"^\d{6}$", description="PIN harus 6 angka")


class KaryawanDriverOption(BaseModel):
    """Pilihan nama di form driver: karyawan aktif. `driver_id` terisi bila
    karyawan itu sudah menjadi driver (satu karyawan satu driver)."""

    id: str
    nama: str
    driver_id: str | None = None


class KasbonDriver(BaseModel):
    """Satu catatan kasbon supir (sisa uang jalan yang tidak dikembalikan)."""

    id: str
    jumlah: float
    # ganti_driver | ganti_unit
    asal: str
    keterangan: str | None = None
    job_id: str | None = None
    job_number: str | None = None
    created_at: str
    created_by_nama: str | None = None


class KasbonDriverRingkas(BaseModel):
    total: float = 0
    riwayat: list[KasbonDriver] = []
