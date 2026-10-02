"""Approval: master approver per fitur & pengajuan yang menunggu keputusan.

Aturan lengkapnya ada di migration 20261001000009 (mesin) & 20261001000010
(penerapan per fitur). Ringkas:

- Mode per fitur: salah_satu / semua / berjenjang. Satu penolakan = ditolak.
- Fitur tanpa approver tidak bisa diajukan; pengaju tidak ikut menyetujui
  pengajuannya sendiri.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

FiturApproval = Literal["tambahan_uang_jalan", "penghapusan_aset", "penjualan_aset"]
ModeApproval = Literal["salah_satu", "semua", "berjenjang"]
StatusPengajuan = Literal["menunggu", "disetujui", "ditolak", "dibatalkan"]
# Status approval yang disimpan di data aslinya (uang_jalan, penjualan_unit, penghapusan_aset).
StatusApprovalData = Literal["menunggu", "disetujui", "ditolak"]
KeputusanLangkah = Literal["menunggu", "setuju", "tolak", "dilewati"]


class FiturApprovalInfo(BaseModel):
    kode: FiturApproval
    nama: str
    mode: ModeApproval
    jumlah_approver: int = 0


class UbahModeInput(BaseModel):
    mode: ModeApproval


class Approver(BaseModel):
    id: str
    fitur_kode: FiturApproval
    fitur_nama: str
    mode: ModeApproval
    karyawan_id: str
    karyawan_nama: str
    urutan: int
    # Karyawan nonaktif / di-blacklist tetap tercatat tapi tidak ikut di pengajuan baru.
    karyawan_aktif: bool


class ApproverInput(BaseModel):
    fitur_kode: FiturApproval
    karyawan_id: str = Field(min_length=1)
    urutan: int = Field(default=1, ge=1, le=20)


class ApproverUbahInput(BaseModel):
    urutan: int = Field(ge=1, le=20)


class KaryawanCalonApprover(BaseModel):
    id: str
    nama: str


class MenuApproval(BaseModel):
    kode: FiturApproval
    nama: str
    menunggu_saya: int


class LangkahApproval(BaseModel):
    karyawan_id: str
    nama: str
    urutan: int
    keputusan: KeputusanLangkah
    catatan: str | None = None
    diputuskan_at: str | None = None


class PengajuanApproval(BaseModel):
    id: str
    fitur_kode: FiturApproval
    ref_id: str
    judul: str
    # Salinan data yang diajukan (isi berbeda per fitur) — approver tidak selalu
    # berhak membuka menu fitur aslinya.
    rincian: dict[str, object] = {}
    nilai: float | None = None
    mode: ModeApproval
    status_approval: StatusPengajuan
    diajukan_oleh_nama: str | None = None
    diajukan_at: str
    diputuskan_at: str | None = None
    alasan_tolak: str | None = None
    # True bila pengguna ini sedang mendapat giliran memutuskan.
    giliran_saya: bool = False
    langkah: list[LangkahApproval] = []


class RiwayatApproval(BaseModel):
    """Approver & keputusan satu pengajuan (mis. tambahan uang jalan di detail job)."""

    mode: ModeApproval
    status_approval: StatusPengajuan
    alasan_tolak: str | None = None
    diajukan_oleh_nama: str | None = None
    diajukan_at: str
    langkah: list[LangkahApproval] = []


class PutuskanInput(BaseModel):
    setuju: bool
    catatan: str | None = Field(default=None, max_length=500)

    @field_validator("catatan")
    @classmethod
    def _rapikan(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class HasilKeputusan(BaseModel):
    # Status pengajuan setelah keputusan ini (masih menunggu approver lain, atau final).
    status_approval: StatusPengajuan
