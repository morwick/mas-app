"""Foto loading/unloading job: unggah ke bucket lalu catat barisnya."""

from __future__ import annotations

from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.core.pg import rows, single
from app.core.storage import (
    remove_object_quietly,
    unique_object_name,
    upload_object,
    validate_photo,
)
from app.core.supabase import storage_public_url
from app.modules.jobs.schemas import JobPhoto, PhotoType


class JobPhotoService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._bucket = get_settings().job_photos_bucket

    async def upload(
        self,
        *,
        job_id: str,
        photo_type: PhotoType,
        data: bytes,
        content_type: str | None,
        uploaded_by: str | None,
    ) -> JobPhoto:
        ext = validate_photo(content_type, len(data))
        path = f"{job_id}/{photo_type}/{unique_object_name(ext)}"
        await upload_object(self._db, self._bucket, path, data, content_type or "image/jpeg")

        try:
            res = await (
                self._db.table("job_photos")
                .insert(
                    {
                        "job_id": job_id,
                        "type": photo_type,
                        "file_path": path,
                        "file_size": len(data),
                        "uploaded_by": uploaded_by,
                    }
                )
                .execute()
            )
        except Exception:
            # Objek sudah naik tapi barisnya gagal — jangan tinggalkan file yatim.
            await remove_object_quietly(self._db, self._bucket, path)
            raise

        row = rows(res)[0]
        return JobPhoto(
            id=row["id"],
            job_id=job_id,
            type=photo_type,
            file_path=path,
            file_url=storage_public_url(self._bucket, path),
            uploaded_at=row["uploaded_at"],
        )

    async def delete(self, photo_id: str) -> None:
        row = single(
            await self._db.table("job_photos").select("id, file_path").eq("id", photo_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Foto tidak ditemukan")
        await self._db.table("job_photos").delete().eq("id", photo_id).execute()
        await remove_object_quietly(self._db, self._bucket, row["file_path"])
