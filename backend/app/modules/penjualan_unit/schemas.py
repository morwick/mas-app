from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

JenisAset = Literal["unit", "unit_trailer"]


class PenjualanUnit(BaseModel):
    id: str
    jenis_aset: JenisAset
    unit_id: str | None = None
    unit_trailer_id: str | None = None
    kode_aset: str
    nama_pembeli: str
    kontak_pembeli: str | None = None
    harga_jual: float
    tanggal_jual: str
    catatan: str | None = None
    bukti_uploaded_at: str | None = None
    # Hanya di detail — URL bertanda tangan sementara (bucket privat).
    bukti_url: str | None = None
    created_by_nama: str | None = None
    created_at: str


class PenjualanUnitInput(BaseModel):
    jenis_aset: JenisAset
    asset_id: str = Field(min_length=1)
    nama_pembeli: str = Field(min_length=1)
    kontak_pembeli: str | None = None
    harga_jual: float = Field(gt=0)
    tanggal_jual: str = Field(min_length=1)
    catatan: str | None = None


class AsetTerjual(BaseModel):
    """Unit/unit trailer berstatus Standby — kandidat yang boleh dicatat terjual."""

    id: str
    kode: str
    jenis_nama: str | None = None
