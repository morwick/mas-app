from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.penjualan_unit.aset import AsetDokumen
from app.modules.penjualan_unit.schemas import JenisAset


class PenghapusanAset(BaseModel):
    id: str
    # Nomor otomatis berita acara penghapusan (migration 20260926000011).
    nomor_berita_acara: str | None = None
    jenis_aset: JenisAset
    unit_id: str | None = None
    unit_trailer_id: str | None = None
    kode_aset: str
    tanggal_hapus: str
    alasan: str
    catatan: str | None = None
    status_aset_sebelum: str | None = None
    bukti_uploaded_at: str | None = None
    # Hanya di detail — URL bertanda tangan sementara (bucket privat).
    bukti_url: str | None = None
    created_by_nama: str | None = None
    created_at: str
    # Data aset untuk isi berita acara.
    aset: AsetDokumen | None = None


class PenghapusanAsetUbah(BaseModel):
    """Isian yang boleh diedit — aset & nomor berita acara tetap."""

    tanggal_hapus: str = Field(min_length=1)
    alasan: str = Field(min_length=1, max_length=1000)
    catatan: str | None = Field(default=None, max_length=2000)

    @field_validator("alasan")
    @classmethod
    def _alasan(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Alasan penghapusan wajib diisi")
        return v


class PenghapusanAsetInput(PenghapusanAsetUbah):
    jenis_aset: JenisAset
    asset_id: str = Field(min_length=1)


class InsidenDibukaLagi(BaseModel):
    """Insiden yang ditutup saat aset dihapus, dibuka lagi saat penghapusan dibatalkan."""

    id: str = Field(min_length=1)
    status: Literal["open", "in_progress"]


class BatalkanPenghapusanInput(BaseModel):
    alasan: str = Field(min_length=1, max_length=1000)
    # Insiden yang tidak disebut dibuka ke status sebelum ditutup.
    insiden: list[InsidenDibukaLagi] = Field(default_factory=list)

    @field_validator("alasan")
    @classmethod
    def _alasan(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Alasan pembatalan wajib diisi")
        return v


class AsetDihapus(BaseModel):
    """Unit/unit trailer yang belum Terjual / Diafkirkan — pilihan di form penghapusan."""

    id: str
    kode: str
    jenis_nama: str | None = None
    status: str
    # Terisi bila aset tidak bisa dihapus (sedang Bertugas).
    alasan_tidak_bisa: str | None = None
    # Insiden yang belum selesai — ikut ditutup "Selesai (diafkirkan)".
    insiden_terbuka: int = 0
