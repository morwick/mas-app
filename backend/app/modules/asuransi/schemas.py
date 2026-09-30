from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Sapaan = Literal["Bapak", "Ibu"]
JenisPertanggungan = Literal["all_risk", "tlo", "lainnya"]


def _teks(v: object) -> object:
    if v is None:
        return None
    teks = " ".join(str(v).split())
    return teks or None


class AsuransiPic(BaseModel):
    id: str
    sapaan: Sapaan | None = None
    nama: str
    jabatan: str | None = None
    no_hp: str
    email: str | None = None
    is_utama: bool = False


class BengkelRekanan(BaseModel):
    id: str
    nama: str
    alamat: str | None = None
    kontak: str | None = None


class Asuransi(BaseModel):
    id: str
    nama: str
    alamat: str | None = None
    telepon: str | None = None
    email: str | None = None
    catatan: str | None = None
    is_active: bool = True
    pic: list[AsuransiPic] = []
    bengkel_rekanan: list[BengkelRekanan] = []
    pic_utama: AsuransiPic | None = None
    # Jumlah aset yang polisnya berlaku hari ini.
    jumlah_aset_aktif: int = 0


class AsuransiPicInput(BaseModel):
    id: str | None = None
    sapaan: Sapaan | None = None
    nama: str = Field(min_length=1, max_length=150)
    jabatan: str | None = Field(default=None, max_length=100)
    no_hp: str = Field(min_length=1, max_length=30)
    email: str | None = Field(default=None, max_length=150)
    is_utama: bool = False

    @field_validator("nama", "jabatan", "no_hp", "email", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)

    @field_validator("nama")
    @classmethod
    def _nama(cls, v: str | None) -> str:
        if not v:
            raise ValueError("Nama PIC wajib diisi")
        return v

    @field_validator("no_hp")
    @classmethod
    def _no_hp(cls, v: str | None) -> str:
        if not v:
            raise ValueError("No HP PIC wajib diisi")
        digit = "".join(c for c in v if c.isdigit())
        if not 8 <= len(digit) <= 15:
            raise ValueError("No HP PIC tidak valid (8–15 digit)")
        return v


class BengkelRekananInput(BaseModel):
    id: str | None = None
    nama: str = Field(min_length=1, max_length=150)
    alamat: str | None = Field(default=None, max_length=500)
    kontak: str | None = Field(default=None, max_length=150)

    @field_validator("nama", "alamat", "kontak", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)

    @field_validator("nama")
    @classmethod
    def _nama(cls, v: str | None) -> str:
        if not v:
            raise ValueError("Nama bengkel rekanan wajib diisi")
        return v


class AsuransiInput(BaseModel):
    nama: str = Field(min_length=1, max_length=150)
    alamat: str | None = Field(default=None, max_length=500)
    telepon: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=150)
    catatan: str | None = Field(default=None, max_length=1000)
    pic: list[AsuransiPicInput] = Field(min_length=1)
    bengkel_rekanan: list[BengkelRekananInput] = []

    @field_validator("nama", "alamat", "telepon", "email", "catatan", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)

    @field_validator("nama")
    @classmethod
    def _nama(cls, v: str | None) -> str:
        if not v:
            raise ValueError("Nama asuransi wajib diisi")
        return v

    @model_validator(mode="after")
    def _satu_pic_utama(self) -> AsuransiInput:
        utama = [p for p in self.pic if p.is_utama]
        if len(utama) > 1:
            raise ValueError("PIC utama hanya boleh satu")
        if not utama:
            self.pic[0].is_utama = True
        return self


# ── Polis ───────────────────────────────────────────────────────────────────


class PolisAsuransi(BaseModel):
    id: str
    asuransi_id: str
    asuransi_nama: str | None = None
    unit_id: str | None = None
    unit_trailer_id: str | None = None
    kode_aset: str | None = None
    nomor_polis: str
    jenis_pertanggungan: JenisPertanggungan
    mulai: str
    berakhir: str
    nilai_pertanggungan: float | None = None
    own_risk: float | None = None
    premi: float | None = None
    catatan: str | None = None
    polis_uploaded_at: str | None = None
    polis_url: str | None = None
    # berlaku = hari ini di dalam periode; akan_datang = belum mulai.
    keadaan: Literal["berlaku", "akan_datang", "berakhir"] = "berlaku"
    sisa_hari: int | None = None
    pic_utama: AsuransiPic | None = None


class PolisInput(BaseModel):
    asuransi_id: str = Field(min_length=1)
    nomor_polis: str = Field(min_length=1, max_length=80)
    jenis_pertanggungan: JenisPertanggungan = "all_risk"
    mulai: date
    berakhir: date
    nilai_pertanggungan: float | None = Field(default=None, ge=0)
    own_risk: float | None = Field(default=None, ge=0)
    premi: float | None = Field(default=None, ge=0)
    catatan: str | None = Field(default=None, max_length=1000)
    # True = dokumen polis yang tersimpan dilepas (diabaikan bila ada file baru).
    hapus_dokumen_polis: bool = False

    @field_validator("nomor_polis", "catatan", mode="before")
    @classmethod
    def _bersihkan(cls, v: object) -> object:
        return _teks(v)

    @field_validator("nomor_polis")
    @classmethod
    def _nomor(cls, v: str | None) -> str:
        if not v:
            raise ValueError("Nomor polis wajib diisi")
        return v

    @model_validator(mode="after")
    def _periode(self) -> PolisInput:
        if self.berakhir < self.mulai:
            raise ValueError("Tanggal berakhir polis tidak boleh sebelum tanggal mulai")
        return self


class PolisBaruInput(PolisInput):
    """Polis baru / perpanjangan dari halaman detail aset."""

    unit_id: str | None = None
    unit_trailer_id: str | None = None

    @model_validator(mode="after")
    def _satu_aset(self) -> PolisBaruInput:
        if bool(self.unit_id) == bool(self.unit_trailer_id):
            raise ValueError("Pilih tepat satu aset: unit atau unit trailer")
        return self
