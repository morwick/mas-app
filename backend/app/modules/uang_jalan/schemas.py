from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.domain.uang_jalan import UangJalanJenis, UangJalanJenisInput, UangJalanRingkasan
from app.modules.approval.schemas import StatusApprovalData


class SumberDana(BaseModel):
    id: str
    nama: str
    bank: str | None = None
    pemegang: str | None = None
    # Huruf kolom di laporan Excel, dipakai saat ekspor.
    kolom_excel: str | None = None
    urutan: int
    is_active: bool


class UangJalan(BaseModel):
    id: str
    job_id: str
    jenis: UangJalanJenis
    tanggal: str
    jumlah: float
    sumber_dana_id: str | None = None
    sumber_dana_nama: str | None = None
    keperluan: str | None = None
    catatan: str | None = None
    created_by_nama: str | None = None
    created_at: str
    # Bukti transfer (bucket privat) — URL bertanda tangan, berlaku sementara.
    bukti_transfer_path: str | None = None
    bukti_transfer_url: str | None = None
    request_id: str | None = None
    # Tambahan uang jalan butuh approval; pencairan selalu "disetujui".
    status_approval: StatusApprovalData = "disetujui"


RequestStatus = Literal["diajukan", "dicairkan", "ditolak"]


class UangJalanRequest(BaseModel):
    id: str
    job_id: str
    job_number: str | None = None
    driver_id: str
    driver_nama: str | None = None
    nominal: float
    catatan: str | None = None
    status: RequestStatus
    alasan_tolak: str | None = None
    uang_jalan_id: str | None = None
    requested_at: str
    decided_at: str | None = None


class UangJalanPosisi(BaseModel):
    """Posisi uang jalan sebuah job, dihitung database (job_uang_jalan_posisi)."""

    # Uang jalan job (awal + tambahan).
    uang_jalan: float
    cair: float
    sisa: float
    ada_bukti: bool
    pending_request: bool


class DriverRequestInput(BaseModel):
    nominal: int = Field(gt=0)
    catatan: str | None = None


class RejectRequestInput(BaseModel):
    alasan: str | None = None


class UangJalanInput(BaseModel):
    job_id: str = Field(min_length=1)
    jenis: UangJalanJenisInput
    tanggal: str = Field(min_length=1)
    # Rupiah penuh — kolomnya BIGINT. Sengaja int, bukan float: pecahan yang
    # lolos ke sini akan dibulatkan diam-diam oleh Postgres, jadi lebih baik
    # ditolak di pintu masuk. Nilai <= 0 ditangani `_validate` agar pesannya
    # tetap berbahasa Indonesia.
    jumlah: int
    sumber_dana_id: str | None = None
    keperluan: str | None = None
    catatan: str | None = None


class SetUangJalanAwalRequest(BaseModel):
    uang_jalan_awal: int = Field(ge=0)


class TambahanDibatalkan(BaseModel):
    """Pengajuan tambahan uang jalan yang dihapus selama menunggu approval."""

    id: str
    tanggal: str
    jumlah: float
    keperluan: str | None = None
    catatan: str | None = None
    created_at: str


class JobUangJalan(BaseModel):
    transaksi: list[UangJalan]
    ringkasan: UangJalanRingkasan
    pengajuan: list[UangJalanRequest] = Field(default_factory=list)
    posisi: UangJalanPosisi | None = None
    # Riwayat saja — tidak ikut dihitung ke ringkasan (migration 20261001000024).
    dibatalkan: list[TambahanDibatalkan] = Field(default_factory=list)


class UangJalanJobRow(BaseModel):
    job_id: str
    job_number: str
    status: str
    asal: str
    tujuan: str
    etd: str
    unit_kode: str | None
    driver_nama: str | None
    customer_nama: str | None
    ringkasan: UangJalanRingkasan
    pencairan_terakhir: str | None
    # Pengajuan driver yang belum dicairkan (perlu tindakan kasir).
    pengajuan_menunggu: int = 0
    # Tambahan uang jalan yang masih menunggu approval.
    tambahan_menunggu_approval: int = 0
