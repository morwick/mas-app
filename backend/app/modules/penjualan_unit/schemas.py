from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.penjualan_unit.aset import AsetDokumen

JenisAset = Literal["unit", "unit_trailer"]
# Dokumen bertanda tangan yang diunggah: surat penjualan / BAST.
DokumenTtd = Literal["surat", "bast"]

# Sama dengan CHECK di DB (migration 20260926000004).
_NO_HP_RE = re.compile(r"^\+?[0-9 .()-]+$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class PenjualanUnit(BaseModel):
    id: str
    # Nomor otomatis (migration 20260926000011): surat penjualan & BAST.
    nomor_surat: str | None = None
    nomor_bast: str | None = None
    jenis_aset: JenisAset
    unit_id: str | None = None
    unit_trailer_id: str | None = None
    kode_aset: str
    nama_pembeli: str
    no_hp_pembeli: str | None = None
    email_pembeli: str | None = None
    harga_jual: float
    tanggal_jual: str
    catatan: str | None = None
    # Orang yang menyerahkan unit — tercetak di tanda tangan penjual / PIHAK PERTAMA.
    penyerah_nama: str | None = None
    penyerah_jabatan: str | None = None
    # Dokumen bertanda tangan (opsional, boleh tidak bersamaan). Selama
    # keduanya kosong, penjualan masih bisa diedit / dibatalkan.
    bukti_uploaded_at: str | None = None  # surat penjualan bertanda tangan
    bukti_bast_uploaded_at: str | None = None
    # Hanya di detail — URL bertanda tangan sementara (bucket privat).
    bukti_url: str | None = None
    bukti_bast_url: str | None = None
    created_by_nama: str | None = None
    created_at: str
    # Data aset untuk isi surat penjualan & BAST.
    aset: AsetDokumen | None = None


class PenjualanUnitUbah(BaseModel):
    """Isian yang boleh diedit — aset & nomor dokumen tetap."""

    nama_pembeli: str = Field(min_length=1)
    penyerah_nama: str | None = Field(default=None, max_length=100)
    penyerah_jabatan: str | None = Field(default=None, max_length=100)
    no_hp_pembeli: str | None = Field(default=None, max_length=30)
    email_pembeli: str | None = Field(default=None, max_length=254)
    # Rupiah bulat — kolom & parameter DB-nya BIGINT; float (mis. 1500.0) ditolak Postgres.
    harga_jual: int = Field(gt=0)
    tanggal_jual: str = Field(min_length=1)
    catatan: str | None = None

    @field_validator("no_hp_pembeli")
    @classmethod
    def _no_hp(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if not v:
            return None
        if not _NO_HP_RE.match(v) or not 8 <= len(re.sub(r"\D", "", v)) <= 15:
            raise ValueError("No HP pembeli tidak valid (8–15 digit)")
        return v

    @field_validator("email_pembeli")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        v = (v or "").strip().lower()
        if not v:
            return None
        if not _EMAIL_RE.match(v):
            raise ValueError("Email pembeli tidak valid")
        return v


class AsetTerjual(BaseModel):
    """Unit/unit trailer yang belum Terjual — pilihan di form penjualan."""

    id: str
    kode: str
    jenis_nama: str | None = None
    status: str
    # Terisi bila aset tidak bisa dijual (Bertugas / Perbaikan / Terjual).
    alasan_tidak_bisa: str | None = None
    # Insiden yang belum selesai (aset Breakdown) — ikut ditutup "Selesai
    # (terjual)" saat dijual; form meminta konfirmasi dulu.
    insiden_terbuka: int = 0


class PenjualanUnitInput(PenjualanUnitUbah):
    jenis_aset: JenisAset
    asset_id: str = Field(min_length=1)
