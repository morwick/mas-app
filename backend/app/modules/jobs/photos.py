"""Foto job oleh admin: unggah ke bucket lalu catat barisnya.

Admin biasanya melengkapi arsip (foto tanpa slot). Bila `slot` diisi, foto
lama pada slot yang sama diganti — sama seperti perilaku portal driver.
Kualitas foto tetap dinilai (FR-PHOTO-05) supaya penanda konsisten.
"""

from __future__ import annotations

from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.core.image_quality import assess_photo_safely
from app.core.pg import rows, single
from app.core.storage import (
    remove_object_quietly,
    unique_object_name,
    upload_object,
    validate_photo,
)
from app.core.supabase import storage_public_url
from app.modules.jobs.schemas import JobPhoto, PhotoSlot, PhotoStage


class JobPhotoService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._bucket = get_settings().job_photos_bucket

    async def upload(
        self,
        *,
        job_id: str,
        stage: PhotoStage,
        slot: PhotoSlot | None,
        data: bytes,
        content_type: str | None,
        uploaded_by: str | None,
    ) -> JobPhoto:
        ext = validate_photo(content_type, len(data))
        path = f"{job_id}/{stage}/{unique_object_name(ext)}"
        quality = assess_photo_safely(data, slot=slot)
        await upload_object(self._db, self._bucket, path, data, content_type or "image/jpeg")

        replaced_path: str | None = None
        try:
            if slot is not None:
                old = single(
                    await self._db.table("job_photos")
                    .select("id, file_path")
                    .eq("job_id", job_id)
                    .eq("stage", stage)
                    .eq("slot", slot)
                    .maybe_single()
                    .execute()
                )
                if old:
                    await self._db.table("job_photos").delete().eq("id", old["id"]).execute()
                    replaced_path = old["file_path"]

            res = await (
                self._db.table("job_photos")
                .insert(
                    {
                        "job_id": job_id,
                        "type": stage,
                        "stage": stage,
                        "slot": slot,
                        "file_path": path,
                        "file_size": len(data),
                        "uploaded_by": uploaded_by,
                        "sharpness_score": quality.sharpness if quality else None,
                        "kualitas_rendah": quality.kualitas_rendah if quality else False,
                    }
                )
                .execute()
            )
        except Exception:
            # Objek sudah naik tapi barisnya gagal — jangan tinggalkan file yatim.
            await remove_object_quietly(self._db, self._bucket, path)
            raise

        if replaced_path:
            await remove_object_quietly(self._db, self._bucket, replaced_path)

        row = rows(res)[0]
        return JobPhoto(
            id=row["id"],
            job_id=job_id,
            type=stage,
            stage=stage,
            slot=slot,
            file_path=path,
            file_url=storage_public_url(self._bucket, path),
            uploaded_at=row["uploaded_at"],
            sharpness_score=quality.sharpness if quality else None,
            kualitas_rendah=quality.kualitas_rendah if quality else False,
        )

    async def delete(self, photo_id: str) -> None:
        row = single(
            await self._db.table("job_photos").select("id, file_path").eq("id", photo_id).maybe_single().execute()
        )
        if row is None:
            raise NotFoundError("Foto tidak ditemukan")
        await self._db.table("job_photos").delete().eq("id", photo_id).execute()
        await remove_object_quietly(self._db, self._bucket, row["file_path"])
