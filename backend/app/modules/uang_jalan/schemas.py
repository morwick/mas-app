from __future__ import annotations

from pydantic import BaseModel, Field

from app.domain.uang_jalan import UangJalanJenis, UangJalanRingkasan


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


class UangJalanInput(BaseModel):
    job_id: str = Field(min_length=1)
    jenis: UangJalanJenis
    tanggal: str = Field(min_length=1)
    jumlah: float
    sumber_dana_id: str | None = None
    keperluan: str | None = None
    catatan: str | None = None


class SetPaguRequest(BaseModel):
    pagu: float = Field(ge=0)


class JobUangJalan(BaseModel):
    transaksi: list[UangJalan]
    ringkasan: UangJalanRingkasan


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
