from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PHONE_RE = re.compile(r"^(08|\+628)\d{7,12}$")

DriverStatus = Literal["stand_by", "in_job"]


class Driver(BaseModel):
    id: str
    nama: str
    no_hp: str
    no_sim: str | None = None
    # Tanggal habis berlaku SIM (YYYY-MM-DD). None = belum dicatat.
    sim_berlaku_sampai: str | None = None
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


class DriverCreate(BaseModel):
    nama: str = Field(min_length=1)
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
    nama: str | None = None
    no_hp: str | None = None
    no_sim: str | None = None
    sim_berlaku_sampai: str | None = None
    alamat: str | None = None
    catatan: str | None = None

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
