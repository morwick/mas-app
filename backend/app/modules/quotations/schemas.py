from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.modules.customers.schemas import Sapaan
from app.modules.jobs.schemas import JobStatus

QuotationStatus = Literal["draft", "terkirim", "deal", "ditolak", "kedaluwarsa"]


class QuotationItem(BaseModel):
    id: str
    quotation_id: str
    urutan: int
    dari: str
    tujuan: str
    qty: int
    satuan: str
    nama_alat: str | None = None
    harga_satuan: float
    # Dihitung database (qty × harga_satuan).
    subtotal: float


class QuotationBase(BaseModel):
    id: str
    quote_number: str
    seq_no: int
    seq_tahun: int
    customer_id: str
    # Snapshot saat surat dibuat — tidak ikut berubah kalau master di-edit.
    customer_nama: str
    customer_kota: str | None = None
    pic_sapaan: Sapaan | None = None
    pic_nama: str | None = None
    kota_terbit: str
    tanggal: str
    berlaku_sampai: str | None = None
    perihal: str
    objek: str | None = None
    lampiran: str | None = None
    ppn_aktif: bool
    ppn_persen: float
    subtotal: float
    ppn_nominal: float
    total: float
    status: QuotationStatus
    ttd_nama: str | None = None
    ttd_jabatan: str | None = None
    catatan: str | None = None
    alasan_ditolak: str | None = None
    sent_at: str | None = None
    decided_at: str | None = None
    created_by_nama: str | None = None
    created_at: str
    updated_at: str


class Quotation(QuotationBase):
    items: list[QuotationItem] = Field(default_factory=list)


class QuotationListRow(QuotationBase):
    jumlah_item: int
    # Job dari penawaran ini, tidak termasuk yang dibatalkan.
    jumlah_job: int
    jumlah_job_selesai: int


class QuotationJobRef(BaseModel):
    id: str
    job_number: str
    status: JobStatus
    asal: str
    tujuan: str
    etd: str


class QuotationItemInput(BaseModel):
    dari: str
    tujuan: str
    qty: float
    satuan: str = "Unit"
    nama_alat: str | None = None
    harga_satuan: float


class QuotationInput(BaseModel):
    customer_id: str = Field(min_length=1)
    pic_sapaan: Sapaan | None = None
    pic_nama: str | None = None
    kota_terbit: str
    tanggal: str
    berlaku_sampai: str
    perihal: str
    objek: str | None = None
    lampiran: str | None = None
    ppn_aktif: bool = False
    ppn_persen: float = 11
    ttd_nama: str | None = None
    ttd_jabatan: str | None = None
    catatan: str | None = None
    items: list[QuotationItemInput] = Field(default_factory=list)


class SetQuotationStatusRequest(BaseModel):
    status: QuotationStatus
    alasan: str | None = None


class QuotationCreated(BaseModel):
    id: str
    quote_number: str


class NextNumberResponse(BaseModel):
    nomor: str
