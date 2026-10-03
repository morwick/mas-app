from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.modules.customers.schemas import Sapaan
from app.modules.jobs.schemas import JobStatus

InvoiceStatus = Literal["draft", "terkirim", "lunas", "batal"]
# Status tampil: "jatuh_tempo" diturunkan dari tanggal saat dibaca, tidak disimpan.
InvoiceTampilStatus = Literal["draft", "terkirim", "lunas", "batal", "jatuh_tempo"]
# Status bayar: dihitung dari dibayar vs total (bukan kolom tersendiri).
StatusBayar = Literal["unpaid", "partial_paid", "completed"]


class UangJalanTransaksi(BaseModel):
    """Satu transaksi uang jalan job — ditampilkan di form & detail tagihan."""

    jenis: str  # pencairan / tambahan
    tanggal: str
    jumlah: float
    keterangan: str | None = None
    # URL bertanda tangan sementara (bucket privat) — None bila tanpa bukti.
    bukti_url: str | None = None


class InvoiceItem(BaseModel):
    id: str
    invoice_id: str
    urutan: int
    # Job yang ditagihkan baris ini. None untuk baris di luar job.
    job_id: str | None = None
    job_number: str | None = None
    # Proyek induk job baris ini (ditampilkan di depan nomor job). proyek_id
    # dipakai untuk menaruh job di bawah baris proyeknya (InvoiceProyek).
    proyek_id: str | None = None
    proyek_nomor: str | None = None
    deskripsi: str
    dari: str | None = None
    tujuan: str | None = None
    qty: int
    satuan: str
    harga_satuan: float
    subtotal: float
    # Ringkasan saja (untuk konteks di rincian tagihan) — None/kosong untuk
    # baris tanpa job atau job yang belum punya transaksi/foto surat jalan.
    uang_jalan_total: float | None = None
    uang_jalan_cair: float | None = None
    surat_jalan_urls: list[str] = []
    # Surat jalan per tahap: saat loading & saat unloading.
    surat_jalan_loading_urls: list[str] = []
    surat_jalan_unloading_urls: list[str] = []
    # Rincian uang jalan: uang jalan awal + tiap pencairan / tambahan (dengan bukti transfer).
    uang_jalan_awal: float | None = None
    uang_jalan_transaksi: list[UangJalanTransaksi] = []


class InvoiceProyek(BaseModel):
    """Baris rincian per proyek: teks bebas yang tercetak di invoice + nominal.
    Job-job proyeknya ada di `items` (proyek_id sama) — nominal dibagi rata."""

    id: str
    invoice_id: str
    proyek_id: str
    proyek_nomor: str | None = None
    urutan: int
    uraian: str
    nominal: float


class InvoicePayment(BaseModel):
    id: str
    invoice_id: str
    tanggal: str
    jumlah: float
    sumber_dana_id: str | None = None
    sumber_dana_nama: str | None = None
    metode: str
    referensi: str | None = None
    catatan: str | None = None
    created_by_nama: str | None = None
    created_at: str


class InvoiceBase(BaseModel):
    id: str
    invoice_number: str
    seq_no: int
    seq_tahun: int
    customer_id: str
    # Snapshot saat tagihan dibuat — untuk dokumen pajak isinya harus tetap.
    customer_nama: str
    customer_alamat: str | None = None
    customer_npwp: str | None = None
    pic_sapaan: Sapaan | None = None
    pic_nama: str | None = None
    quotation_id: str | None = None
    quotation_number: str | None = None
    kota_terbit: str
    tanggal: str
    termin_hari: int | None = None
    jatuh_tempo: str | None = None
    ppn_aktif: bool
    ppn_persen: float
    # Potongan PPh 23 (perusahaan pemberi jasa) — mengurangi total.
    pph23_aktif: bool = False
    pph23_persen: float = 2
    subtotal: float
    ppn_nominal: float
    pph23_nominal: float = 0
    # subtotal + PPN − PPh 23 = yang dibayar customer.
    total: float
    # Diisi database dari invoice_payments.
    dibayar: float
    sisa: float
    status: InvoiceStatus
    status_tampil: InvoiceTampilStatus
    status_bayar: StatusBayar
    hari_terlambat: int | None = None
    ttd_nama: str | None = None
    ttd_jabatan: str | None = None
    bank_nama: str | None = None
    bank_rekening: str | None = None
    bank_atas_nama: str | None = None
    catatan: str | None = None
    alasan_batal: str | None = None
    sent_at: str | None = None
    lunas_at: str | None = None
    created_by_nama: str | None = None
    created_at: str
    updated_at: str


class Invoice(InvoiceBase):
    # Hanya di detail — tidak perlu di list, dan URL-nya bertanda tangan
    # sementara (bucket privat) jadi tidak masuk akal disimpan di baris list.
    faktur_pajak_uploaded_at: str | None = None
    faktur_pajak_url: str | None = None
    # Rincian per proyek. Kosong untuk tagihan lama (sebelum rincian per
    # proyek) — tagihan seperti itu tetap ditampilkan per baris `items`.
    proyek: list[InvoiceProyek] = Field(default_factory=list)
    items: list[InvoiceItem] = Field(default_factory=list)
    payments: list[InvoicePayment] = Field(default_factory=list)


class InvoiceListRow(InvoiceBase):
    jumlah_item: int
    # Nomor proyek dari job-job di tagihan ini (satu tagihan boleh banyak proyek).
    proyek_nomor: list[str] = Field(default_factory=list)


class InvoiceItemInput(BaseModel):
    job_id: str | None = None
    deskripsi: str
    dari: str | None = None
    tujuan: str | None = None
    qty: float
    satuan: str = "Unit"
    harga_satuan: float


class InvoiceProyekInput(BaseModel):
    proyek_id: str = Field(min_length=1)
    # Teks yang tercetak di invoice untuk proyek ini (boleh beberapa baris).
    uraian: str
    nominal: float
    # Job proyek yang ikut ditagih — disimpan satu baris per job di
    # invoice_items dengan nominal dibagi rata.
    job_ids: list[str] = Field(default_factory=list)


class InvoiceInput(BaseModel):
    customer_id: str = Field(min_length=1)
    quotation_id: str | None = None
    pic_sapaan: Sapaan | None = None
    pic_nama: str | None = None
    kota_terbit: str
    tanggal: str
    termin_hari: int | None = None
    jatuh_tempo: str | None = None
    ppn_aktif: bool = False
    ppn_persen: float = 11
    pph23_aktif: bool = False
    pph23_persen: float = 2
    ttd_nama: str | None = None
    ttd_jabatan: str | None = None
    bank_nama: str | None = None
    bank_rekening: str | None = None
    bank_atas_nama: str | None = None
    catatan: str | None = None
    proyek: list[InvoiceProyekInput] = Field(default_factory=list)
    # Baris di luar proyek (mis. biaya tambahan).
    items: list[InvoiceItemInput] = Field(default_factory=list)


class SetInvoiceStatusRequest(BaseModel):
    # `lunas` sengaja tidak diterima: itu lahir dari pembayaran, bukan keputusan.
    status: Literal["draft", "terkirim", "batal"]
    alasan: str | None = None


class PaymentInput(BaseModel):
    tanggal: str = Field(min_length=1)
    jumlah: float
    sumber_dana_id: str | None = None
    metode: str | None = None
    referensi: str | None = None
    catatan: str | None = None


class InvoiceCreated(BaseModel):
    id: str
    invoice_number: str


class JobBelumDitagihRow(BaseModel):
    id: str
    job_number: str
    asal: str
    tujuan: str
    alat_diangkut: str
    etd: str
    completed_at: str | None
    # Ringkas saja — dipakai untuk konteks di layar pilih job, bukan rincian.
    uang_jalan_total: float
    uang_jalan_cair: float
    surat_jalan_urls: list[str] = []
    # Surat jalan per tahap: saat loading & saat unloading.
    surat_jalan_loading_urls: list[str] = []
    surat_jalan_unloading_urls: list[str] = []
    # Rincian uang jalan: uang jalan awal + tiap pencairan / tambahan (dengan bukti transfer).
    uang_jalan_awal: float | None = None
    uang_jalan_transaksi: list[UangJalanTransaksi] = []
    # Proyek induk job. Satu proyek hanya boleh masuk satu tagihan: bila job
    # lain proyek ini sudah ada di tagihan aktif, job ini hanya bisa
    # ditambahkan ke tagihan tersebut (proyek_invoice_*).
    proyek_id: str | None = None
    proyek_nomor: str | None = None
    proyek_invoice_id: str | None = None
    proyek_invoice_number: str | None = None
    # Jumlah job proyek ini yang tidak dibatalkan (tab "Proyek siap ditagih").
    proyek_jumlah_job: int = 0


class FinanceDashboardSummary(BaseModel):
    tagihan_belum_lunas_jumlah: int
    tagihan_belum_lunas_nominal: float
    tagihan_jatuh_tempo_jumlah: int
    tagihan_jatuh_tempo_nominal: float
    invoice_belum_faktur_pajak_jumlah: int
    pembayaran_bulan_ini_nominal: float


class PiutangSummaryRow(BaseModel):
    customer_id: str
    customer_nama: str
    jumlah_invoice: int
    total_tagihan: float
    total_dibayar: float
    sisa: float
    belum_jatuh_tempo: float
    umur_1_30: float
    umur_31_60: float
    umur_60_plus: float


class ProyekProfitabilityRow(BaseModel):
    """Laba per proyek: jumlah angka job-job proyek (get_proyek_profitability)."""

    proyek_id: str
    nomor_proyek: str
    customer_nama: str
    # Proyek tanpa customer (unit jalan kosongan): tidak ditagih → cost perusahaan.
    kosongan: bool = False
    unit_kode: str
    # ETD job pertama — dasar rentang tanggal laporan.
    etd_awal: str
    jumlah_job: int
    semua_selesai: bool
    invoice_id: str | None = None
    invoice_number: str | None = None
    pendapatan: float
    uang_jalan: float
    biaya_insiden: float
    laba: float


class JobProfitabilityRow(BaseModel):
    job_id: str
    job_number: str
    customer_nama: str
    unit_kode: str
    etd: str
    status: JobStatus
    pendapatan: float
    uang_jalan: float
    biaya_insiden: float
    laba: float
    proyek_nomor: str | None = None
    # Proyek tanpa customer (unit jalan kosongan): tidak ditagih → cost perusahaan.
    kosongan: bool = False
    # Job lama yang unitnya rusak & diganti job ini — tidak ditagih.
    diganti_oleh: str | None = None
