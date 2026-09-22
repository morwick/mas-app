from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Sapaan = Literal["Bapak", "Ibu"]


class Customer(BaseModel):
    id: str
    nama_perusahaan: str
    alamat: str | None = None
    catatan: str | None = None
    is_active: bool
    created_at: str
    # Legalitas & billing — dipakai surat penawaran dan tagihan.
    kota: str | None = None
    npwp: str | None = None
    nib: str | None = None
    status_pkp: bool = False
    termin_hari: int | None = None
    pic_sapaan: Sapaan | None = None
    pic_nama: str | None = None
    pic_jabatan: str | None = None
    pic_no_hp: str | None = None
    pic_email: str | None = None


class CustomerCreate(BaseModel):
    nama_perusahaan: str = Field(min_length=1)
    alamat: str | None = None
    catatan: str | None = None
    kota: str | None = None
    npwp: str | None = None
    nib: str | None = None
    status_pkp: bool = False
    termin_hari: int | None = None
    pic_sapaan: Sapaan | None = None
    pic_nama: str | None = None
    pic_jabatan: str | None = None
    pic_no_hp: str | None = None
    pic_email: str | None = None


class CustomerUpdate(BaseModel):
    nama_perusahaan: str | None = None
    alamat: str | None = None
    catatan: str | None = None
    kota: str | None = None
    npwp: str | None = None
    nib: str | None = None
    status_pkp: bool | None = None
    termin_hari: int | None = None
    pic_sapaan: Sapaan | None = None
    pic_nama: str | None = None
    pic_jabatan: str | None = None
    pic_no_hp: str | None = None
    pic_email: str | None = None
