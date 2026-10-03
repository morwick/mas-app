from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.modules.invoices.schemas import InvoiceTampilStatus, StatusBayar
from app.modules.jobs.schemas import PHONE_RE, Job, JobCreate, JobCreated

# Filter "status tagih" di Tab Proyek: sudah / belum masuk tagihan aktif.
StatusTagih = Literal["belum", "sudah"]
# Filter Tab Proyek: aktif | batal (semua job proyek dibatalkan).
StatusProyek = Literal["aktif", "batal"]


class ProyekRingkas(BaseModel):
    """Satu baris di Tab Proyek."""

    id: str
    nomor_proyek: str
    # Kosong = proyek tanpa customer (unit jalan kosongan).
    customer_id: str | None = None
    customer_nama: str | None = None
    pic_nama: str | None = None
    pic_no_hp: str | None = None
    created_by_nama: str | None = None
    created_at: str
    jumlah_job: int = 0
    jumlah_job_selesai: int = 0
    jumlah_job_batal: int = 0
    # Tagihan aktif (tidak batal) yang memuat proyek ini — paling banyak satu.
    invoice_id: str | None = None
    invoice_number: str | None = None
    # Unit proyek (bisa >1 setelah ganti unit karena rusak) & penawaran asalnya.
    unit_kode: str | None = None
    quote_number: str | None = None


class JobUnitBaris(BaseModel):
    """Satu job yang memakai sebuah unit (Tab Proyek per unit)."""

    job_id: str
    job_number: str
    proyek_id: str
    nomor_proyek: str
    # Kosong = proyek tanpa customer (unit jalan kosongan).
    customer_nama: str | None = None
    asal: str | None = None
    tujuan: str | None = None
    # ETD — acuan bila belum muat.
    etd: str | None = None
    tanggal_muat: str | None = None
    tanggal_bongkar: str | None = None
    # Job dibatalkan.
    dibatalkan: bool = False


class ProyekPerUnit(BaseModel):
    """Satu unit + job-job yang memakainya pada periode terpilih (urut tanggal muat)."""

    unit_id: str
    kode_unit: str
    no_polisi: str | None = None
    jenis_unit_nama: str | None = None
    jobs: list[JobUnitBaris] = Field(default_factory=list)


class ProyekTagihan(BaseModel):
    """Tagihan yang pernah dibuat untuk proyek ini, termasuk yang dibatalkan.
    Nominal hanya untuk superadmin & finance (admin: nomor & status saja)."""

    id: str
    invoice_number: str
    tanggal: str
    created_at: str
    status_tampil: InvoiceTampilStatus
    status_bayar: StatusBayar
    alasan_batal: str | None = None
    total: float | None = None
    dibayar: float | None = None
    sisa: float | None = None


class ProyekBiayaJob(BaseModel):
    """Uang jalan & biaya lain satu job — angka sama dengan kartu di detail job."""

    # Uang jalan job = awal + tambahan disetujui; cair = pencairan − pengembalian.
    uang_jalan: float = 0
    cair: float = 0
    sisa: float = 0
    biaya_lain: float = 0


class ProyekDetail(ProyekRingkas):
    jobs: list[Job] = Field(default_factory=list)
    # Per job_id.
    biaya_job: dict[str, ProyekBiayaJob] = Field(default_factory=dict)
    # Urut dibuat paling awal di atas; kosong untuk operator.
    tagihan: list[ProyekTagihan] = Field(default_factory=list)


class _ProyekKlien(BaseModel):
    """Customer & PIC lapangan proyek (dipindah dari job). PIC & No HP PIC
    opsional; No HP yang diisi harus berformat benar."""

    customer_id: str | None = None
    pic_nama: str | None = Field(None, max_length=200)
    pic_no_hp: str | None = Field(None, max_length=30)

    @field_validator("customer_id", "pic_nama", "pic_no_hp")
    @classmethod
    def _kosong_jadi_none(cls, v: str | None) -> str | None:
        return (v or "").strip() or None

    @field_validator("pic_no_hp")
    @classmethod
    def _format_hp(cls, v: str | None) -> str | None:
        if v and not PHONE_RE.match(v):
            raise ValueError("Format No HP PIC: 08xxxxxxxxxx atau +628xxxxxxxxxx")
        return v


class ProyekCreate(_ProyekKlien):
    # BATASAN: proyek baru wajib langsung berisi minimal 1 job — semuanya
    # disimpan dalam satu transaksi (database juga menolak proyek tanpa job).
    jobs: list[JobCreate] = Field(min_length=1, max_length=50)


class ProyekUpdate(_ProyekKlien):
    # Job baru yang ditambahkan dari form edit proyek. Job yang sudah ada
    # diubah lewat halaman edit job masing-masing.
    jobs_baru: list[JobCreate] = Field(default_factory=list, max_length=50)


class ProyekCari(BaseModel):
    """Proyek dari penawaran yang sama dengan unit yang sama — tujuan "Gabung"."""

    id: str
    nomor_proyek: str


class ProyekCreated(BaseModel):
    id: str
    nomor_proyek: str
    jobs: list[JobCreated]


class ProyekUpdated(BaseModel):
    jobs_baru: list[JobCreated] = Field(default_factory=list)
