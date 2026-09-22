"""Portal driver: login PIN, daftar job, konfirmasi, update status, foto, e-POD.

Tidak ada fungsi di sini yang menerima driver_id dari pemanggil. Baris yang
boleh terbaca ditentukan RLS lewat token sesi di header, jadi halaman tidak
bisa keliru (atau dipaksa) membuka job milik driver lain. Semua perubahan
lewat RPC yang mengunci urutan status dan mengembalikan error kalau ditolak.
"""

from __future__ import annotations

import base64
import re
import time
from typing import cast

from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError, UnauthorizedError, ValidationError
from app.core.pg import clean_text, first, rows, single
from app.core.storage import (
    MAX_PHOTO_BYTES,
    remove_object_quietly,
    unique_object_name,
    upload_object,
    validate_photo,
)
from app.core.supabase import storage_public_url
from app.domain.job_conflicts import ACTIVE_JOB_STATUSES
from app.modules.driver_portal.schemas import (
    DriverJobFilter,
    DriverLoginRequest,
    DriverPodRequest,
    DriverSessionResponse,
)
from app.modules.jobs.mappers import DRIVER_JOB_SELECT, to_job
from app.modules.jobs.schemas import Job, JobPhoto, JobStatus, PhotoType

_SIGNATURE_RE = re.compile(r"^data:image/png;base64,([A-Za-z0-9+/=]+)$")


class DriverPortalService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._bucket = get_settings().job_photos_bucket

    async def login(self, payload: DriverLoginRequest, *, user_agent: str | None) -> DriverSessionResponse:
        """Verifikasi PIN dan penerbitan token dikerjakan `driver_login` di DB, supaya
        PIN mentah tidak dibandingkan di aplikasi dan pesan gagalnya seragam —
        nomor tak terdaftar dan PIN salah tidak boleh bisa dibedakan."""
        try:
            res = await self._db.rpc(
                "driver_login",
                {
                    "p_no_hp": payload.no_hp.strip(),
                    "p_pin": payload.pin,
                    "p_user_agent": user_agent,
                },
            ).execute()
        except Exception as exc:  # noqa: BLE001 — sengaja seragam
            raise UnauthorizedError("Nomor HP atau PIN salah") from exc

        row = first(res.data)
        if not row or not row.get("token"):
            raise UnauthorizedError("Nomor HP atau PIN salah")

        return DriverSessionResponse(
            token=str(row["token"]),
            driver_id=str(row["driver_id"]),
            nama=str(row.get("nama") or ""),
            no_hp=payload.no_hp.strip(),
            expires_at=row.get("expires_at"),
        )

    async def logout(self) -> None:
        try:
            await self._db.rpc("driver_logout").execute()
        except Exception:  # noqa: BLE001 — sesi yang sudah mati tetap dianggap logout
            pass

    async def my_jobs(self, *, status: DriverJobFilter = "all") -> list[Job]:
        # Belum dikonfirmasi lebih dulu, lalu yang paling dekat berangkat — itu
        # yang dibutuhkan driver di HP, bukan urutan pembuatan.
        q = self._db.table("jobs").select(DRIVER_JOB_SELECT).order("accepted_at", nullsfirst=True).order("etd")
        if status == "active":
            q = q.in_("status", list(ACTIVE_JOB_STATUSES))
        return [to_job(r) for r in rows(await q.execute())]

    async def my_job(self, job_id: str) -> Job:
        row = single(await self._db.table("jobs").select(DRIVER_JOB_SELECT).eq("id", job_id).maybe_single().execute())
        # Job orang lain sampai di sini sebagai None — sama seperti yang memang tidak ada.
        if row is None:
            raise NotFoundError("Job tidak ditemukan")
        return to_job(row)

    async def accept(self, job_id: str) -> str:
        """Driver tidak bisa menolak — penugasan keputusan admin. Yang dicatat
        adalah kapan job benar-benar sampai ke orangnya."""
        res = await self._db.rpc("driver_accept_job", {"p_job_id": job_id}).execute()
        return str(res.data)

    async def update_status(self, job_id: str, status: JobStatus, notes: str | None) -> JobStatus:
        res = await self._db.rpc(
            "driver_update_job_status",
            {"p_job_id": job_id, "p_status": status, "p_notes": clean_text(notes)},
        ).execute()
        return cast(JobStatus, res.data)

    async def submit_pod(self, job_id: str, payload: DriverPodRequest) -> None:
        """Serah terima barang sekaligus menutup job. Yang menutup job adalah RPC
        dalam satu transaksi — tidak mungkin ada job selesai yang bukti terimanya
        gagal tersimpan."""
        if not payload.penerima_nama.strip():
            raise ValidationError("Nama penerima wajib diisi")

        signature_path: str | None = None
        if payload.signature_data_url:
            match = _SIGNATURE_RE.match(payload.signature_data_url)
            if not match:
                raise ValidationError("Format tanda tangan tidak dikenal")
            data = base64.b64decode(match.group(1))
            if len(data) > MAX_PHOTO_BYTES:
                raise ValidationError("Tanda tangan terlalu besar")
            signature_path = f"{job_id}/pod/{int(time.time() * 1000)}.png"
            await upload_object(self._db, self._bucket, signature_path, data, "image/png")

        try:
            await self._db.rpc(
                "driver_submit_pod",
                {
                    "p_job_id": job_id,
                    "p_nama": payload.penerima_nama.strip(),
                    "p_jabatan": clean_text(payload.penerima_jabatan),
                    "p_signature_path": signature_path,
                    "p_catatan": clean_text(payload.catatan),
                },
            ).execute()
        except Exception:
            # Job tidak jadi ditutup — tanda tangannya jangan menggantung di bucket.
            if signature_path:
                await remove_object_quietly(self._db, self._bucket, signature_path)
            raise

    async def upload_photo(
        self, *, job_id: str, photo_type: PhotoType, data: bytes, content_type: str | None
    ) -> JobPhoto:
        ext = validate_photo(content_type, len(data))
        path = f"{job_id}/{photo_type}/{unique_object_name(ext)}"
        await upload_object(self._db, self._bucket, path, data, content_type or "image/jpeg")
        try:
            res = await (
                self._db.table("job_photos").insert({"job_id": job_id, "type": photo_type, "file_path": path}).execute()
            )
        except Exception:
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
