"""Dokumen opsional yang ikut form tambah/edit master (SIM driver, STNK & KIR
unit, KIR & SRUT unit trailer).

Form dikirim multipart: isian JSON di field `data`, file di field bernama
jenis dokumennya. Setiap jenis dokumen punya kolom `<jenis>_path` dan
`<jenis>_uploaded_at` di tabelnya; file disimpan di bucket privat
`dokumen-master` dan dibuka lewat signed URL.

Urutan simpan (supaya tidak ada data setengah jadi):
  1. file baru diunggah dulu,
  2. baris ditulis dalam satu perintah (satu transaksi database),
  3. gagal → file baru dibuang; berhasil → file lama yang diganti dibuang.
"""

from __future__ import annotations

from typing import Any, TypeVar

from fastapi import UploadFile
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError
from supabase import AsyncClient

from app.core.config import get_settings
from app.core.storage import remove_object_quietly, unique_object_name, upload_object, validate_document
from app.core.timeutil import iso_utc

DOKUMEN_SIGNED_URL_TTL_S = 60 * 60

M = TypeVar("M", bound=BaseModel)


class BerkasUnggah(BaseModel):
    data: bytes
    content_type: str | None = None


def parse_form(model: type[M], data: str) -> M:
    """Isian form (JSON di field `data`) → model; error jadi 422 seperti body JSON."""
    try:
        return model.model_validate_json(data)
    except PydanticValidationError as exc:
        raise RequestValidationError(exc.errors(include_url=False, include_context=False)) from exc


async def baca_berkas(file: UploadFile | None) -> BerkasUnggah | None:
    if file is None or not file.filename:
        return None
    return BerkasUnggah(data=await file.read(), content_type=file.content_type)


async def signed_url_dokumen(client: AsyncClient, path: str | None) -> str | None:
    if not path:
        return None
    try:
        res = await client.storage.from_(get_settings().dokumen_master_bucket).create_signed_url(
            path, DOKUMEN_SIGNED_URL_TTL_S
        )
        return res.get("signedURL") or res.get("signedUrl")
    except Exception:  # noqa: BLE001 — dokumen yang tidak terbaca jangan gagalkan halaman
        return None


class PerubahanDokumen:
    """Kumpulan perubahan dokumen untuk satu baris.

    Pakai: `kolom = await p.siapkan(...)` untuk tiap jenis → gabungkan ke data
    insert/update → bila tulis gagal `await p.batalkan()`, bila berhasil
    `await p.selesaikan()`.
    """

    def __init__(self, client: AsyncClient, folder: str, row_id: str) -> None:
        self._db = client
        self._bucket = get_settings().dokumen_master_bucket
        self._folder = f"{folder}/{row_id}"
        self._baru: list[str] = []
        self._dibuang: list[str] = []

    async def siapkan(
        self, jenis: str, berkas: BerkasUnggah | None, *, hapus: bool = False, lama: str | None = None
    ) -> dict[str, Any]:
        """Kolom yang berubah untuk dokumen `jenis`. File baru mengalahkan `hapus`."""
        if berkas is not None:
            ext = validate_document(berkas.content_type, len(berkas.data))
            path = f"{self._folder}/{jenis}-{unique_object_name(ext)}"
            await upload_object(self._db, self._bucket, path, berkas.data, berkas.content_type or "application/pdf")
            self._baru.append(path)
            if lama:
                self._dibuang.append(lama)
            return {f"{jenis}_path": path, f"{jenis}_uploaded_at": iso_utc()}
        if hapus and lama:
            self._dibuang.append(lama)
            return {f"{jenis}_path": None, f"{jenis}_uploaded_at": None}
        return {}

    async def batalkan(self) -> None:
        for path in self._baru:
            await remove_object_quietly(self._db, self._bucket, path)

    async def selesaikan(self) -> None:
        for path in self._dibuang:
            await remove_object_quietly(self._db, self._bucket, path)
