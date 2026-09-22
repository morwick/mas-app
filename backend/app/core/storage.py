"""Unggah/hapus objek di Supabase Storage dengan validasi foto yang seragam."""

from __future__ import annotations

import logging
import secrets
import time

from supabase import AsyncClient

from app.core.errors import ValidationError

log = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_MIME = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
_EXT_BY_MIME = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp"}


def validate_photo(content_type: str | None, size: int) -> str:
    """Kembalikan ekstensi file bila lolos; error bila terlalu besar / tipe salah."""
    if size <= 0:
        raise ValidationError("File foto kosong")
    if size > MAX_PHOTO_BYTES:
        raise ValidationError("Ukuran foto melebihi 5 MB")
    if content_type not in ALLOWED_IMAGE_MIME:
        raise ValidationError("Format foto harus JPG, PNG, atau WEBP")
    return _EXT_BY_MIME[content_type]


def unique_object_name(ext: str) -> str:
    return f"{int(time.time() * 1000)}-{secrets.token_hex(3)}.{ext}"


async def upload_object(client: AsyncClient, bucket: str, path: str, data: bytes, content_type: str) -> None:
    await client.storage.from_(bucket).upload(path, data, {"content-type": content_type, "cache-control": "3600"})


async def remove_object_quietly(client: AsyncClient, bucket: str, path: str) -> None:
    """Best-effort: kegagalan hapus objek tidak boleh menggagalkan operasi utama."""
    try:
        await client.storage.from_(bucket).remove([path])
    except Exception as exc:  # noqa: BLE001
        log.warning("gagal hapus objek %s/%s: %s", bucket, path, exc)
