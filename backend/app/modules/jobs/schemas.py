from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, field_validator

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
    customer_id: str
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
    uang_jalan_pagu: float | None = None
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
    validation_note: str | None = None
    eta_is_estimated: bool = False
    quotation_id: str | None = None
    quotation_number: str | None = None
    # Total uang jalan yang sudah dicairkan ke driver. Lebih dari nol berarti
    # job tidak bisa dibatalkan lagi.
    uang_jalan_cair: float = 0.0
    # Pengajuan pencairan uang jalan yang masih menunggu keputusan admin.
    # Hanya terisi pada payload internal; portal driver dan halaman publik
    # memakai select tanpa kolom ini, jadi nilainya tetap False di sana.
    uang_jalan_pending: bool = False
    uang_jalan_pending_nominal: float | None = None
    uang_jalan_pending_at: str | None = None
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


class GantiTrukRequest(BaseModel):
    """Ganti truk di tengah perjalanan (truk rusak). Driver opsional ikut diganti."""

    unit_id: str = Field(min_length=1)
    alasan: str = Field(min_length=1, max_length=1000)
    # None = driver tetap.
    driver_id: str | None = None
    # Wajib bila jenis unit truk baru memakai trailer (dijaga database).
    unit_trailer_id: str | None = None

    @field_validator("alasan")
    @classmethod
    def _alasan(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Alasan ganti truk wajib diisi")
        return v


class GantiTrukEntry(BaseModel):
    """Satu baris riwayat pergantian truk pada job."""

    id: str
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


class _JobFields(BaseModel):
    pic_nama: str | None = None
    pic_no_hp: str | None = None
    asal_lat: float | None = None
    asal_lng: float | None = None
    tujuan_lat: float | None = None
    tujuan_lng: float | None = None
    eta: str | None = None
    catatan: str | None = None

    @field_validator("pic_no_hp")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        if v is None or not v.strip():
            return v
        if not PHONE_RE.match(v.strip()):
            raise ValueError("Format No HP PIC: 08xxxxxxxxxx atau +628xxxxxxxxxx")
        return v.strip()


class JobCreate(_JobFields):
    # PIC lapangan wajib sejak awal — driver dan admin selalu punya kontak
    # yang bisa dihubungi di titik muat/bongkar.
    pic_nama: str = Field(min_length=1)
    pic_no_hp: str = Field(min_length=1)
    customer_id: str = Field(min_length=1)
    alat_diangkut: str = Field(min_length=1)
    asal: str = Field(min_length=1)
    tujuan: str = Field(min_length=1)
    unit_id: str = Field(min_length=1)
    # Wajib bila jenis unit dari unit-nya punya jenis unit trailer (dijaga database).
    unit_trailer_id: str | None = None
    driver_id: str = Field(min_length=1)
    etd: str = Field(min_length=1)
    # BR-04: uang jalan sudah diketahui sejak awal — wajib.
    uang_jalan_pagu: int = Field(gt=0, description="Pagu uang jalan (rupiah)")
    # Diisi bila job lahir dari penawaran yang sudah deal.
    quotation_id: str | None = None
    # True bila admin sudah mengonfirmasi tetap simpan meski ada bentrok.
    allow_conflict: bool = False

    @field_validator("pic_nama", "pic_no_hp")
    @classmethod
    def _pic_required(cls, v: str) -> str:
        text = v.strip()
        if not text:
            raise ValueError("PIC dan No HP PIC wajib diisi")
        return text


class JobUpdate(_JobFields):
    customer_id: str | None = None
    alat_diangkut: str | None = None
    asal: str | None = None
    tujuan: str | None = None
    unit_id: str | None = None
    # Dikirim bersama unit_id saat unit diganti; null = tanpa unit trailer.
    unit_trailer_id: str | None = None
    driver_id: str | None = None
    etd: str | None = None
    allow_conflict: bool = False

    @field_validator("pic_nama", "pic_no_hp")
    @classmethod
    def _pic_not_blank(cls, v: str | None) -> str | None:
        """Field boleh absen (update parsial), tapi tidak boleh dikosongkan."""
        if v is not None and not v.strip():
            raise ValueError("PIC dan No HP PIC wajib diisi")
        return v


class JobCreated(BaseModel):
    id: str
    job_number: str
    share_token: str


class JobConflictResponse(BaseModel):
    """Dikirim sebagai 409 saat bentrok terdeteksi dan `allow_conflict` false."""

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
