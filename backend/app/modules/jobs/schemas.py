from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.domain.job_conflicts import ConflictCheckResult

JobStatus = Literal[
    "menunggu_pickup",  # nilai lama, tidak dipakai lagi setelah migrasi v2
    "ditugaskan",
    "diterima",
    "loading",
    "dalam_perjalanan",
    "unloading",
    "serah_terima_pool",
    "menunggu_validasi",
    "selesai",
    "cancelled",
]
PhotoStage = Literal["loading", "unloading", "serah_terima"]
PhotoType = PhotoStage
PhotoSlot = Literal["depan", "belakang", "kanan", "kiri", "surat_jalan", "serah_terima"]
# Yang diterima saat unggah: aplikasi driver versi lama masih mengirim
# 'surat_timbang' (nama lama slot surat jalan) — dinormalkan ke 'surat_jalan'.
PhotoSlotMasukan = Literal["depan", "belakang", "kanan", "kiri", "surat_jalan", "surat_timbang", "serah_terima"]


def normalisasi_slot(slot: PhotoSlotMasukan) -> PhotoSlot:
    return "surat_jalan" if slot == "surat_timbang" else slot


JobListFilter = Literal["active", "menunggu_validasi", "selesai", "cancelled", "all"]

# Slot yang wajib terisi per tahap (BR-06).
REQUIRED_SLOTS: dict[str, tuple[str, ...]] = {
    "loading": ("depan", "belakang", "kanan", "kiri", "surat_jalan"),
    "unloading": ("depan", "belakang", "kanan", "kiri", "surat_jalan"),
    "serah_terima": ("serah_terima",),
}

PHONE_RE = re.compile(r"^(08|\+628)\d{7,12}$")


class JobPhoto(BaseModel):
    id: str
    job_id: str
    type: PhotoType
    stage: PhotoStage
    # None untuk foto lama (sebelum v2) yang tidak punya slot.
    slot: PhotoSlot | None = None
    file_path: str
    file_url: str
    uploaded_at: str
    sharpness_score: float | None = None
    kualitas_rendah: bool = False
    taken_at: str | None = None
    lat: float | None = None
    lng: float | None = None


class Job(BaseModel):
    id: str
    job_number: str
    share_token: str
    # Customer & PIC lapangan diambil dari proyek job ini (kolomnya ada di
    # proyek). Customer boleh kosong: unit jalan kosongan.
    customer_id: str | None = None
    customer_nama: str
    pic_nama: str | None = None
    pic_no_hp: str | None = None
    alat_diangkut: str
    asal: str
    tujuan: str
    asal_lat: float | None = None
    asal_lng: float | None = None
    tujuan_lat: float | None = None
    tujuan_lng: float | None = None
    route_polyline: str | None = None
    route_distance_km: float | None = None
    route_duration_min: float | None = None
    # Borongan uang jalan yang disepakati di awal. Tidak dikirim ke halaman publik.
    uang_jalan_awal: float | None = None
    unit_id: str
    # Wajib bila jenis unit dari unit-nya punya jenis unit trailer (dijaga database).
    unit_trailer_id: str | None = None
    unit_trailer_kode: str | None = None
    driver_id: str
    etd: str
    eta: str | None = None
    status: JobStatus
    catatan: str | None = None
    cancelled_reason: str | None = None
    # Kapan driver menekan "Terima Job". None = belum dikonfirmasi.
    accepted_at: str | None = None
    # Bukti terima barang (e-POD).
    pod_penerima_nama: str | None = None
    pod_penerima_jabatan: str | None = None
    pod_signature_path: str | None = None
    pod_signature_url: str | None = None
    pod_catatan: str | None = None
    pod_at: str | None = None
    created_at: str
    completed_at: str | None = None
    # Validasi admin (Fase 7).
    validated_at: str | None = None
    validated_by_nama: str | None = None
    # Karyawan pembuat job (hanya data internal, tidak untuk customer).
    created_by_nama: str | None = None
    validation_note: str | None = None
    eta_is_estimated: bool = False
    quotation_id: str | None = None
    quotation_number: str | None = None
    # Sales job (master sales). Hanya payload internal; portal driver &
    # halaman publik tidak membawanya.
    sales_id: str | None = None
    sales_nama: str | None = None
    sales_no_hp: str | None = None
    # Waktu sampai lokasi muat / bongkar (pertama kali masuk Loading /
    # Unloading; ganti unit memakai tanggal insiden). Diisi database
    # (trigger jobs_catat_muat_bongkar), tidak pernah diubah sesudahnya.
    muat_at: str | None = None
    bongkar_at: str | None = None
    # Proyek induk job ini (setiap job wajib punya proyek). Hanya payload
    # internal; portal driver & halaman publik tidak membawanya.
    proyek_id: str | None = None
    proyek_nomor: str | None = None
    # Ganti unit karena rusak: job pengganti → job lama, dan sebaliknya.
    menggantikan_job_id: str | None = None
    menggantikan_job_number: str | None = None
    diganti_oleh_job_id: str | None = None
    diganti_oleh_job_number: str | None = None
    # Item penawaran (yang deal) asal job ini.
    quotation_item_id: str | None = None
    # Total uang jalan yang sudah dicairkan ke driver. Lebih dari nol berarti
    # job tidak bisa dibatalkan lagi.
    uang_jalan_cair: float = 0.0
    # Sudah pernah ada uang jalan keluar (pencairan aktif) — unit, unit trailer &
    # driver tidak bisa diubah lewat edit job (pakai Ganti driver / unit).
    ada_pencairan_uang_jalan: bool = False
    # Pengajuan pencairan uang jalan yang masih menunggu keputusan admin.
    # Hanya terisi pada payload internal; portal driver dan halaman publik
    # memakai select tanpa kolom ini, jadi nilainya tetap False di sana.
    uang_jalan_pending: bool = False
    uang_jalan_pending_nominal: float | None = None
    uang_jalan_pending_at: str | None = None
    # Tagihan aktif (tidak batal) yang memuat job ini: nomor & status bayar
    # untuk admin (supaya bisa mengingatkan finance); operator tidak menerimanya.
    invoice_id: str | None = None
    invoice_number: str | None = None
    invoice_status_bayar: str | None = None
    # Khusus superadmin & finance: status tagihan & sisa nominal.
    invoice_status_tampil: str | None = None
    invoice_hari_terlambat: int | None = None
    invoice_sisa: float | None = None
    # True = info tagihan di atas ikut dikirim (admin); False = tidak (operator).
    info_tagihan: bool = False
    photos: list[JobPhoto] = Field(default_factory=list)
    # Diisi hanya oleh portal driver / halaman publik.
    unit_kode: str | None = None
    unit_no_polisi: str | None = None


class JobStatusHistoryEntry(BaseModel):
    id: str
    job_id: str
    status_old: JobStatus | None
    status_new: JobStatus
    changed_by_nama: str
    changed_by_driver: bool
    changed_at: str
    notes: str | None = None


class _AlasanPenggantian(BaseModel):
    alasan: str = Field(min_length=1, max_length=1000)

    @field_validator("alasan")
    @classmethod
    def _alasan(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Alasan penggantian wajib diisi")
        return v


class _InsidenPenggantian(BaseModel):
    """Unit / unit trailer yang rusak dicatat sebagai insiden kerusakan."""

    insiden_tanggal: str = Field(min_length=1)
    insiden_lokasi: str | None = Field(default=None, max_length=500)
    insiden_deskripsi: str = Field(min_length=1, max_length=2000)

    @field_validator("insiden_deskripsi")
    @classmethod
    def _deskripsi(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Deskripsi insiden wajib diisi")
        return v


class _InsidenGantiUnit(BaseModel):
    """Insiden unit lama saat ganti unit: pakai insiden terbuka yang sudah
    dicatat untuk job ini (`insiden_id`), atau catat insiden baru."""

    insiden_id: str | None = None
    insiden_tanggal: str | None = None
    insiden_lokasi: str | None = Field(default=None, max_length=500)
    insiden_deskripsi: str | None = Field(default=None, max_length=2000)

    @field_validator("insiden_id", "insiden_tanggal", "insiden_deskripsi")
    @classmethod
    def _kosong_jadi_none(cls, v: str | None) -> str | None:
        return (v or "").strip() or None

    @model_validator(mode="after")
    def _insiden_wajib(self) -> _InsidenGantiUnit:
        # BATASAN: tanpa insiden terdaftar, tanggal & deskripsi insiden baru wajib.
        if not self.insiden_id and not (self.insiden_tanggal and self.insiden_deskripsi):
            raise ValueError("Pilih insiden yang sudah terdaftar, atau isi tanggal & deskripsi insiden")
        return self


class _PengembalianKasbon(BaseModel):
    """Uang jalan di tangan supir lama: dikembalikan ke kas dan/atau jadi kasbon.

    BATASAN: jumlah keduanya ≤ uang jalan yang sudah cair (dijaga database)."""

    uang_jalan_dikembalikan: int = Field(default=0, ge=0)
    # Kas yang menerima uang yang dikembalikan — wajib bila ada pengembalian.
    sumber_dana_id: str | None = None
    kasbon: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _kas_wajib(self) -> _PengembalianKasbon:
        if self.uang_jalan_dikembalikan > 0 and not self.sumber_dana_id:
            raise ValueError("Pilih kas yang menerima uang jalan yang dikembalikan")
        return self


class GantiDriverRequest(_AlasanPenggantian, _PengembalianKasbon):
    """Ganti driver saat job berjalan (sakit / kabur) — job & proyek sama."""

    driver_id: str = Field(min_length=1)


class GantiTrailerRequest(_AlasanPenggantian, _InsidenPenggantian):
    """Unit trailer rusak saat job berjalan — job & proyek sama."""

    unit_trailer_id: str = Field(min_length=1)


class GantiUnitRequest(_AlasanPenggantian, _InsidenGantiUnit, _PengembalianKasbon):
    """Unit rusak / insiden → job pengganti (mulai dari awal) di proyek yang sama.
    Job lama ditutup Selesai dengan catatan "Unit rusak - diganti JOB-xxx"."""

    unit_id: str = Field(min_length=1)
    driver_id: str = Field(min_length=1)
    # Wajib bila jenis unit pengganti memakai trailer (dijaga database).
    unit_trailer_id: str | None = None
    etd: str = Field(min_length=1)
    eta: str | None = None
    uang_jalan_awal: int = Field(gt=0, description="Uang jalan job pengganti (rupiah)")
    catatan: str | None = None


class GantiTrukEntry(BaseModel):
    """Satu baris riwayat penggantian pada job (driver / trailer / unit)."""

    id: str
    # ganti_truk (riwayat lama) | ganti_driver | ganti_trailer | ganti_unit
    jenis: str = "ganti_truk"
    diganti_pada: str
    status_job_saat_ganti: str
    alasan: str
    unit_lama_kode: str | None = None
    unit_baru_kode: str | None = None
    driver_lama_nama: str | None = None
    driver_baru_nama: str | None = None
    unit_trailer_lama_kode: str | None = None
    unit_trailer_baru_kode: str | None = None
    diganti_oleh_nama: str | None = None
    uang_jalan_dikembalikan: float = 0
    kasbon: float = 0
    # Ganti unit: job pengganti yang dibuat.
    job_pengganti_id: str | None = None
    job_pengganti_number: str | None = None
    # Status job pengganti ("cancelled" hanya ada di data lama — kini job
    # pengganti tidak bisa dibatalkan).
    job_pengganti_status: str | None = None


class _JobFields(BaseModel):
    # Customer, PIC lapangan, dan No HP PIC milik PROYEK (migration
    # 20261001000012) — tidak diisi per job.
    asal_lat: float | None = None
    asal_lng: float | None = None
    tujuan_lat: float | None = None
    tujuan_lng: float | None = None
    eta: str | None = None
    catatan: str | None = None
    # Sales (opsional — ada job tanpa sales). `sales_id` = sales dari daftar;
    # tanpa `sales_id`, `sales_nama` = nama yang diketik (sales baru bila belum
    # ada di daftar, disimpan satu transaksi dengan job — lihat SalesService).
    # Edit job: kirim ketiganya kosong untuk melepas sales dari job.
    sales_id: str | None = None
    sales_nama: str | None = Field(default=None, max_length=200)
    sales_no_hp: str | None = Field(default=None, max_length=30)

    @field_validator("sales_id", "sales_nama", "sales_no_hp")
    @classmethod
    def _sales_kosong_jadi_none(cls, v: str | None) -> str | None:
        return (v or "").strip() or None

    @field_validator("sales_no_hp")
    @classmethod
    def _format_hp_sales(cls, v: str | None) -> str | None:
        if v and not PHONE_RE.match(v):
            raise ValueError("Format No HP sales: 08xxxxxxxxxx atau +628xxxxxxxxxx")
        return v


class JobCreate(_JobFields):
    alat_diangkut: str = Field(min_length=1)
    asal: str = Field(min_length=1)
    tujuan: str = Field(min_length=1)
    unit_id: str = Field(min_length=1)
    # Wajib bila jenis unit dari unit-nya punya jenis unit trailer (dijaga database).
    unit_trailer_id: str | None = None
    driver_id: str = Field(min_length=1)
    etd: str = Field(min_length=1)
    # BR-04: uang jalan sudah diketahui sejak awal — wajib.
    uang_jalan_awal: int = Field(gt=0, description="Uang jalan job (rupiah)")
    # Diisi bila job lahir dari penawaran yang sudah deal.
    quotation_id: str | None = None
    # Wajib bila quotation_id diisi dan penawarannya punya lebih dari satu item deal.
    quotation_item_id: str | None = None
    # BATASAN: job wajib masuk proyek. Diisi saat menambah job lewat POST /jobs;
    # job yang dibuat lewat form proyek (POST/PATCH /proyek) mendapat proyek
    # dari transaksinya. Database juga menolak job tanpa proyek.
    proyek_id: str | None = None


class JobUpdate(_JobFields):
    alat_diangkut: str | None = None
    asal: str | None = None
    tujuan: str | None = None
    unit_id: str | None = None
    # Dikirim bersama unit_id saat unit diganti; null = tanpa unit trailer.
    unit_trailer_id: str | None = None
    driver_id: str | None = None
    etd: str | None = None


class JobCreated(BaseModel):
    id: str
    job_number: str
    share_token: str


class JobConflictResponse(BaseModel):
    """Dikirim sebagai 409 saat bentrok terdeteksi — job tidak disimpan."""

    detail: str
    conflicts: ConflictCheckResult


class UpdateStatusRequest(BaseModel):
    status: JobStatus
    notes: str | None = None


class CancelRequest(BaseModel):
    reason: str | None = None


class ConflictCheckRequest(BaseModel):
    unit_id: str
    driver_id: str
    etd: str
    eta: str | None = None
    exclude_job_id: str | None = None


class ActiveJobByUnit(BaseModel):
    unit_id: str
    job: Job


class ReturnJobRequest(BaseModel):
    note: str = Field(min_length=1)
    to_status: Literal["loading", "dalam_perjalanan", "unloading", "serah_terima_pool"] = "serah_terima_pool"


class StatusResponse(BaseModel):
    status: JobStatus
