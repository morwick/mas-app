from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.modules.asuransi.schemas import AsuransiPic, PolisAsuransi
from app.modules.perintah_kerja.tanggungan import Tanggungan

JenisAset = Literal["unit", "unit_trailer"]
Sumber = Literal["servis_berkala", "insiden", "keluhan_driver", "inspeksi", "lainnya"]
JenisWo = Literal["rutin", "oli", "ban", "mesin", "kelistrikan", "rem", "body", "lainnya"]
Prioritas = Literal["rendah", "normal", "tinggi"]
Pelaksana = Literal["internal", "bengkel", "asuransi"]
StatusWo = Literal[
    "draft", "dijadwalkan", "dikerjakan", "menunggu_sparepart", "menunggu_asuransi", "selesai", "dibatalkan"
]
StatusKlaim = Literal["diajukan", "survei", "disetujui", "ditolak", "dibayar"]
JenisFoto = Literal["sebelum", "sesudah", "dokumen", "klaim"]

STATUS_AKTIF: tuple[str, ...] = ("dikerjakan", "menunggu_sparepart", "menunggu_asuransi")
STATUS_FINAL: tuple[str, ...] = ("selesai", "dibatalkan")


def _teks(v: object) -> object:
    if v is None:
        return None
    teks = " ".join(str(v).split())
    return teks or None


# ── Baca ────────────────────────────────────────────────────────────────────


class MekanikBertugas(BaseModel):
    id: str
    mekanik_id: str
    nama: str
    is_penanggung_jawab: bool = False


class JasaItem(BaseModel):
    id: str
    uraian: str
    mekanik_id: str | None = None
    mekanik_nama: str | None = None
    jam_kerja: float | None = None
    biaya: float = 0


class SparepartItem(BaseModel):
    id: str
    kode: str | None = None
    nama: str
    qty: float
    satuan: str | None = None
    harga_satuan: float = 0
    subtotal: float = 0
    keterangan: str | None = None


class BiayaLainItem(BaseModel):
    id: str
    uraian: str
    biaya: float = 0


class FotoWo(BaseModel):
    id: str
    jenis: JenisFoto
    nama_file: str | None = None
    content_type: str | None = None
    url: str | None = None
    created_at: str


class Klaim(BaseModel):
    id: str
    nomor_klaim: str | None = None
    tanggal_pengajuan: str | None = None
    status_klaim: StatusKlaim
    nilai_diajukan: float | None = None
    nilai_disetujui: float | None = None
    own_risk: float | None = None
    catatan: str | None = None
    pic: AsuransiPic | None = None


class PerintahKerjaRingkas(BaseModel):
    id: str
    nomor: str
    tanggal: str
    jenis_aset: JenisAset
    aset_id: str
    kode_aset: str
    jenis: JenisWo
    sumber: Sumber
    prioritas: Prioritas
    keluhan: str | None = None
    pelaksana: Pelaksana
    pelaksana_nama: str | None = None
    status_wo: StatusWo
    jadwal_mulai: str | None = None
    estimasi_selesai: str | None = None
    tanggal_selesai: str | None = None
    odometer_km: float | None = None
    total_biaya: float = 0
    tanggungan: Tanggungan
    incident_id: str | None = None
    status_klaim: StatusKlaim | None = None


class PerintahKerja(PerintahKerjaRingkas):
    diagnosa: str | None = None
    catatan: str | None = None
    alasan_batal: str | None = None
    no_nota: str | None = None
    bengkel_id: str | None = None
    polis: PolisAsuransi | None = None
    bengkel_rekanan_id: str | None = None
    bengkel_rekanan_nama: str | None = None
    mekanik: list[MekanikBertugas] = []
    jasa: list[JasaItem] = []
    sparepart: list[SparepartItem] = []
    biaya_lain: list[BiayaLainItem] = []
    foto: list[FotoWo] = []
    klaim: Klaim | None = None
    total_jasa: float = 0
    total_sparepart: float = 0
    total_lain: float = 0
    created_at: str


# ── Tulis ───────────────────────────────────────────────────────────────────


class MekanikInput(BaseModel):
    mekanik_id: str = Field(min_length=1)
    is_penanggung_jawab: bool = False


class JasaInput(BaseModel):
    id: str | None = None
    uraian: str = Field(min_length=1, max_length=500)
    mekanik_id: str | None = None
    jam_kerja: float | None = Field(default=None, ge=0, le=100_000)
    biaya: float = Field(default=0, ge=0)

    @field_validator("uraian", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)


class SparepartInput(BaseModel):
    id: str | None = None
    kode: str | None = Field(default=None, max_length=80)
    nama: str = Field(min_length=1, max_length=200)
    qty: float = Field(gt=0, le=1_000_000)
    satuan: str | None = Field(default=None, max_length=30)
    harga_satuan: float = Field(default=0, ge=0)
    keterangan: str | None = Field(default=None, max_length=500)

    @field_validator("kode", "nama", "satuan", "keterangan", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)


class BiayaLainInput(BaseModel):
    id: str | None = None
    uraian: str = Field(min_length=1, max_length=300)
    biaya: float = Field(default=0, ge=0)

    @field_validator("uraian", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)


class KlaimInput(BaseModel):
    pic_id: str | None = None
    nomor_klaim: str | None = Field(default=None, max_length=80)
    tanggal_pengajuan: date | None = None
    status_klaim: StatusKlaim = "diajukan"
    nilai_diajukan: float | None = Field(default=None, ge=0)
    nilai_disetujui: float | None = Field(default=None, ge=0)
    own_risk: float | None = Field(default=None, ge=0)
    catatan: str | None = Field(default=None, max_length=1000)

    @field_validator("nomor_klaim", "catatan", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)

    @model_validator(mode="after")
    def _disetujui(self) -> KlaimInput:
        if self.status_klaim in ("disetujui", "dibayar") and self.nilai_disetujui is None:
            raise ValueError("Nilai disetujui wajib diisi bila klaim disetujui / dibayar")
        return self


class PerintahKerjaInput(BaseModel):
    unit_id: str | None = None
    unit_trailer_id: str | None = None
    tanggal: date
    incident_id: str | None = None
    sumber: Sumber = "lainnya"
    jenis: JenisWo = "lainnya"
    prioritas: Prioritas = "normal"
    keluhan: str | None = Field(default=None, max_length=2000)
    diagnosa: str | None = Field(default=None, max_length=2000)
    catatan: str | None = Field(default=None, max_length=2000)
    pelaksana: Pelaksana = "internal"
    bengkel_id: str | None = None
    polis_id: str | None = None
    bengkel_rekanan_id: str | None = None
    no_nota: str | None = Field(default=None, max_length=80)
    jadwal_mulai: date | None = None
    estimasi_selesai: date | None = None
    odometer_km: float | None = Field(default=None, ge=0)
    # Status awal saat membuat (draft / dijadwalkan / dikerjakan). Perubahan
    # berikutnya lewat endpoint status.
    status_wo: Literal["draft", "dijadwalkan", "dikerjakan"] = "draft"
    mekanik: list[MekanikInput] = []
    jasa: list[JasaInput] = []
    sparepart: list[SparepartInput] = []
    biaya_lain: list[BiayaLainInput] = []
    klaim: KlaimInput | None = None

    @field_validator("keluhan", "diagnosa", "catatan", "no_nota", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)

    @model_validator(mode="after")
    def _cek(self) -> PerintahKerjaInput:
        if bool(self.unit_id) == bool(self.unit_trailer_id):
            raise ValueError("Pilih tepat satu aset: unit atau unit trailer")
        if self.pelaksana == "internal" and not self.mekanik:
            raise ValueError("Pilih minimal satu mekanik untuk pelaksana mekanik internal")
        if self.pelaksana == "bengkel" and not self.bengkel_id:
            raise ValueError("Pilih bengkel untuk pelaksana bengkel luar")
        if self.pelaksana == "asuransi" and not self.polis_id:
            raise ValueError("Aset belum punya polis asuransi yang berlaku pada tanggal ini")
        ids = [m.mekanik_id for m in self.mekanik]
        if len(ids) != len(set(ids)):
            raise ValueError("Mekanik yang sama dipilih lebih dari sekali")
        pj = [m for m in self.mekanik if m.is_penanggung_jawab]
        if len(pj) > 1:
            raise ValueError("Penanggung jawab hanya boleh satu mekanik")
        if self.mekanik and not pj:
            self.mekanik[0].is_penanggung_jawab = True
        if self.estimasi_selesai and self.jadwal_mulai and self.estimasi_selesai < self.jadwal_mulai:
            raise ValueError("Estimasi selesai tidak boleh sebelum jadwal mulai")
        return self


class UbahStatusInput(BaseModel):
    status_wo: StatusWo
    alasan_batal: str | None = Field(default=None, max_length=1000)
    tanggal_selesai: date | None = None
    odometer_km: float | None = Field(default=None, ge=0)

    @field_validator("alasan_batal", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)

    @model_validator(mode="after")
    def _alasan(self) -> UbahStatusInput:
        if self.status_wo == "dibatalkan" and not self.alasan_batal:
            raise ValueError("Alasan pembatalan wajib diisi")
        return self
