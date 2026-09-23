"""Portal driver (dipakai aplikasi Flutter dan portal web transisi).

Tidak ada fungsi di sini yang menerima driver_id dari pemanggil. Baris yang
boleh terbaca ditentukan RLS lewat token sesi di header, dan semua perubahan
lewat RPC SECURITY DEFINER yang menegakkan Lock System, Sequence Lock, dan
kelengkapan foto per slot (PRD v2 §4).
"""

from __future__ import annotations

import logging
from typing import cast

from supabase import AsyncClient

from app.core.config import get_settings
from app.core.errors import NotFoundError, UnauthorizedError, ValidationError
from app.core.image_quality import assess_photo_safely
from app.core.pg import clean_text, first, rows, single
from app.core.storage import (
    remove_object_quietly,
    unique_object_name,
    upload_object,
    validate_photo,
)
from app.core.supabase import get_client_factory, storage_public_url
from app.domain.job_conflicts import ACTIVE_JOB_STATUSES
from app.modules.driver_portal.schemas import (
    DriverJobFilter,
    DriverLoginRequest,
    DriverNotification,
    DriverSessionResponse,
)
from app.modules.jobs.mappers import DRIVER_JOB_SELECT, to_job
from app.modules.jobs.schemas import Job, JobPhoto, JobStatus, PhotoSlot, PhotoStage
from app.modules.uang_jalan.schemas import JobUangJalan, UangJalanRequest
from app.modules.uang_jalan.service import UangJalanService

log = logging.getLogger(__name__)


class DriverPortalService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client
        self._bucket = get_settings().job_photos_bucket

    # ── Sesi ────────────────────────────────────────────────────────────────

    async def login(self, payload: DriverLoginRequest, *, user_agent: str | None) -> DriverSessionResponse:
        """Verifikasi PIN dan penerbitan token dikerjakan `driver_login` di DB, supaya
        PIN mentah tidak dibandingkan di aplikasi dan pesan gagalnya seragam."""
        try:
            res = await self._db.rpc(
                "driver_login",
                {"p_no_hp": payload.no_hp.strip(), "p_pin": payload.pin, "p_user_agent": user_agent},
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

    async def logout(self, *, fcm_token: str | None = None) -> None:
        try:
            if fcm_token:
                await self._db.rpc("driver_unregister_device", {"p_fcm_token": fcm_token}).execute()
            await self._db.rpc("driver_logout").execute()
        except Exception:  # noqa: BLE001 — sesi yang sudah mati tetap dianggap logout
            pass

    async def register_device(self, *, fcm_token: str, platform: str) -> None:
        await self._db.rpc("driver_register_device", {"p_fcm_token": fcm_token, "p_platform": platform}).execute()

    # ── Job ─────────────────────────────────────────────────────────────────

    async def my_jobs(self, *, status: DriverJobFilter = "all") -> list[Job]:
        # Belum dikonfirmasi lebih dulu, lalu yang paling dekat berangkat.
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

    async def accept(self, job_id: str) -> tuple[str, JobStatus]:
        """Driver tidak bisa menolak — penugasan keputusan admin. Yang dicatat
        adalah kapan job benar-benar sampai ke orangnya; status → diterima."""
        res = await self._db.rpc("driver_accept_job", {"p_job_id": job_id}).execute()
        job = await self.my_job(job_id)
        return str(res.data), job.status

    async def update_status(self, job_id: str, status: JobStatus, notes: str | None) -> JobStatus:
        res = await self._db.rpc(
            "driver_update_job_status",
            {"p_job_id": job_id, "p_status": status, "p_notes": clean_text(notes)},
        ).execute()
        return cast(JobStatus, res.data)

    # ── Foto per slot (FR-PHOTO) ────────────────────────────────────────────

    async def upload_slot_photo(
        self,
        *,
        job_id: str,
        stage: PhotoStage,
        slot: PhotoSlot,
        data: bytes,
        content_type: str | None,
        taken_at: str | None,
        lat: float | None,
        lng: float | None,
    ) -> JobPhoto:
        if (stage == "serah_terima") != (slot == "serah_terima"):
            raise ValidationError("Slot tidak cocok dengan tahap foto")

        ext = validate_photo(content_type, len(data))
        quality = assess_photo_safely(data, slot=slot)
        path = f"{job_id}/{stage}/{slot}-{unique_object_name(ext)}"
        await upload_object(self._db, self._bucket, path, data, content_type or "image/jpeg")

        try:
            res = await self._db.rpc(
                "driver_register_job_photo",
                {
                    "p_job_id": job_id,
                    "p_stage": stage,
                    "p_slot": slot,
                    "p_file_path": path,
                    "p_file_size": len(data),
                    "p_sharpness": quality.sharpness if quality else None,
                    "p_kualitas_rendah": quality.kualitas_rendah if quality else False,
                    "p_taken_at": taken_at,
                    "p_lat": lat,
                    "p_lng": lng,
                },
            ).execute()
        except Exception:
            # Objek sudah naik tapi barisnya ditolak — jangan tinggalkan file yatim.
            await remove_object_quietly(self._db, self._bucket, path)
            raise

        row = first(res.data) or {}
        # Foto lama pada slot yang sama dihapus dari bucket lewat service role:
        # driver tidak punya hak hapus objek, dan itu memang urusan sistem.
        replaced = row.get("replaced_path")
        if replaced:
            async with get_client_factory().admin() as admin:
                await remove_object_quietly(admin, self._bucket, replaced)

        return JobPhoto(
            id=str(row.get("id")),
            job_id=job_id,
            type=stage,
            stage=stage,
            slot=slot,
            file_path=path,
            file_url=storage_public_url(self._bucket, path),
            uploaded_at=taken_at or "",
            sharpness_score=quality.sharpness if quality else None,
            kualitas_rendah=quality.kualitas_rendah if quality else False,
            taken_at=taken_at,
            lat=lat,
            lng=lng,
        )

    # ── Uang jalan (FR-UJ) ──────────────────────────────────────────────────

    async def uang_jalan(self, job_id: str) -> JobUangJalan:
        # Bukti transfer tidak dibagikan ke driver — hanya nominal & status.
        return await UangJalanService(self._db).job_summary(job_id, with_bukti_url=False)

    async def request_uang_jalan(self, job_id: str, *, nominal: int, catatan: str | None) -> UangJalanRequest:
        return await UangJalanService(self._db).driver_request(job_id, nominal=nominal, catatan=catatan)

    # ── Notifikasi ──────────────────────────────────────────────────────────

    async def notifications(self, *, limit: int = 50) -> list[DriverNotification]:
        res = await (
            self._db.table("notifications")
            .select("id, kind, title, body, href, job_id, read_at, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [DriverNotification(**r) for r in rows(res)]

    async def mark_read(self, ids: list[str]) -> None:
        from app.core.timeutil import iso_utc

        q = self._db.table("notifications").update({"read_at": iso_utc()}).is_("read_at", "null")
        if ids:
            q = q.in_("id", ids)
        await q.execute()
