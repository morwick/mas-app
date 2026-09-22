from __future__ import annotations

from datetime import timedelta
from typing import Any

from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.errors import AppError, NotFoundError
from app.core.pg import clean_text, first, num_or_none, rows, single
from app.core.timeutil import iso_utc, parse_iso
from app.domain.job_conflicts import (
    ACTIVE_JOB_STATUSES,
    ConflictCandidate,
    ConflictCheckResult,
    ScheduledJob,
    find_job_conflicts,
)
from app.integrations.routing.openrouteservice import try_get_route
from app.modules.jobs.mappers import JOB_SELECT, to_job
from app.modules.jobs.schemas import (
    ActiveJobByUnit,
    CancelRequest,
    ConflictCheckRequest,
    Job,
    JobCreate,
    JobCreated,
    JobListFilter,
    JobStatusHistoryEntry,
    JobUpdate,
    UpdateStatusRequest,
)


class JobConflictError(AppError):
    """Bentrok jadwal — 409 dengan daftar job yang beririsan."""

    status_code = 409

    def __init__(self, conflicts: ConflictCheckResult) -> None:
        super().__init__("Bentrok jadwal terdeteksi.", extra={"conflicts": conflicts.model_dump()})
        self.conflicts = conflicts


def _to_iso(value: str) -> str:
    return iso_utc(parse_iso(value))


class JobService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    # ── Baca ────────────────────────────────────────────────────────────────

    async def list_all(self, *, status: JobListFilter = "all", customer_id: str | None = None) -> list[Job]:
        q = self._db.table("jobs").select(JOB_SELECT).order("created_at", desc=True)
        if status == "active":
            q = q.in_("status", list(ACTIVE_JOB_STATUSES))
        elif status in ("selesai", "cancelled"):
            q = q.eq("status", status)
        if customer_id:
            q = q.eq("customer_id", customer_id)
        return [to_job(r) for r in rows(await q.execute())]

    async def get(self, job_id: str) -> Job:
        row = single(await self._db.table("jobs").select(JOB_SELECT).eq("id", job_id).maybe_single().execute())
        if row is None:
            raise NotFoundError("Job tidak ditemukan")
        return to_job(row)

    async def count_active(self) -> int:
        res = await (
            self._db.table("jobs")
            .select("id", count=CountMethod.exact, head=True)
            .in_("status", list(ACTIVE_JOB_STATUSES))
            .execute()
        )
        return res.count or 0

    async def active_by_unit(self) -> list[ActiveJobByUnit]:
        res = await self._db.table("jobs").select(JOB_SELECT).in_("status", list(ACTIVE_JOB_STATUSES)).execute()
        by_unit: dict[str, Job] = {}
        for r in rows(res):
            job = to_job(r)
            by_unit[job.unit_id] = job
        return [ActiveJobByUnit(unit_id=uid, job=job) for uid, job in by_unit.items()]

    async def list_by_unit(self, unit_id: str) -> list[Job]:
        res = await (
            self._db.table("jobs").select(JOB_SELECT).eq("unit_id", unit_id).order("created_at", desc=True).execute()
        )
        return [to_job(r) for r in rows(res)]

    async def list_in_range(self, start: str, end: str) -> list[Job]:
        """Job yang menyentuh rentang tanggal (papan jadwal).

        Job tanpa ETA dianggap satu hari sejak ETD — menganggapnya tak berujung
        akan memenuhi papan, nol menit akan menyembunyikannya.
        """
        res = await (
            self._db.table("jobs")
            .select(JOB_SELECT)
            .neq("status", "cancelled")
            .lte("etd", f"{end}T23:59:59")
            .order("etd")
            .execute()
        )
        start_dt = parse_iso(f"{start}T00:00:00")
        out: list[Job] = []
        for r in rows(res):
            job = to_job(r)
            akhir = parse_iso(job.eta) if job.eta else parse_iso(job.etd) + timedelta(days=1)
            if akhir >= start_dt:
                out.append(job)
        return out

    async def status_history(self, job_id: str) -> list[JobStatusHistoryEntry]:
        res = await (
            self._db.table("job_status_history")
            .select("*, profiles(nama), driver:drivers(nama)")
            .eq("job_id", job_id)
            .order("changed_at", desc=True)
            .execute()
        )
        out = []
        for r in rows(res):
            driver = first(r.get("driver")) or {}
            profile = first(r.get("profiles")) or {}
            out.append(
                JobStatusHistoryEntry(
                    id=r["id"],
                    job_id=r["job_id"],
                    status_old=r.get("status_old"),
                    status_new=r["status_new"],
                    changed_by_nama=driver.get("nama") or profile.get("nama") or "Sistem",
                    changed_by_driver=bool(r.get("changed_by_driver")),
                    changed_at=r["changed_at"],
                    notes=r.get("notes"),
                )
            )
        return out

    # ── Bentrok jadwal ──────────────────────────────────────────────────────

    async def check_conflicts(self, payload: ConflictCheckRequest) -> ConflictCheckResult:
        active = await self.list_all(status="active")
        return find_job_conflicts(
            ConflictCandidate(
                unit_id=payload.unit_id,
                driver_id=payload.driver_id,
                etd=payload.etd,
                eta=payload.eta,
                exclude_job_id=payload.exclude_job_id,
            ),
            [
                ScheduledJob(
                    id=j.id,
                    job_number=j.job_number,
                    customer_nama=j.customer_nama,
                    unit_id=j.unit_id,
                    driver_id=j.driver_id,
                    etd=j.etd,
                    eta=j.eta,
                    status=j.status,
                )
                for j in active
            ],
        )

    async def _reject_if_conflicting(self, payload: ConflictCheckRequest) -> None:
        conflicts = await self.check_conflicts(payload)
        if conflicts.has_any:
            raise JobConflictError(conflicts)

    # ── Tulis ───────────────────────────────────────────────────────────────

    async def create(self, payload: JobCreate, *, created_by: str | None) -> JobCreated:
        if not payload.allow_conflict:
            await self._reject_if_conflicting(
                ConflictCheckRequest(
                    unit_id=payload.unit_id,
                    driver_id=payload.driver_id,
                    etd=payload.etd,
                    eta=payload.eta,
                )
            )

        route = await try_get_route(payload.asal_lat, payload.asal_lng, payload.tujuan_lat, payload.tujuan_lng)
        data = {
            "customer_id": payload.customer_id,
            "pic_nama": clean_text(payload.pic_nama),
            "pic_no_hp": clean_text(payload.pic_no_hp),
            "alat_diangkut": payload.alat_diangkut.strip(),
            "asal": payload.asal.strip(),
            "tujuan": payload.tujuan.strip(),
            "asal_lat": payload.asal_lat,
            "asal_lng": payload.asal_lng,
            "tujuan_lat": payload.tujuan_lat,
            "tujuan_lng": payload.tujuan_lng,
            "route_polyline": route.polyline if route else None,
            "route_distance_km": route.distance_km if route else None,
            "route_duration_min": route.duration_min if route else None,
            "unit_id": payload.unit_id,
            "driver_id": payload.driver_id,
            "etd": _to_iso(payload.etd),
            "eta": _to_iso(payload.eta) if payload.eta else None,
            "catatan": clean_text(payload.catatan),
            "quotation_id": payload.quotation_id or None,
            "created_by": created_by,
        }
        res = await self._db.table("jobs").insert(data).execute()
        row = rows(res)[0]
        return JobCreated(id=row["id"], job_number=row["job_number"], share_token=row["share_token"])

    async def update(self, job_id: str, payload: JobUpdate) -> None:
        fields = payload.model_dump(exclude_unset=True)
        touches_schedule = any(k in fields for k in ("unit_id", "driver_id", "etd", "eta"))

        current: dict[str, Any] | None = None
        if touches_schedule or _coords_changed(fields):
            current = single(
                await self._db.table("jobs")
                .select("unit_id, driver_id, etd, eta, asal_lat, asal_lng, tujuan_lat, tujuan_lng")
                .eq("id", job_id)
                .maybe_single()
                .execute()
            )
            if current is None:
                raise NotFoundError("Job tidak ditemukan")

        if touches_schedule and not payload.allow_conflict and current is not None:
            await self._reject_if_conflicting(
                ConflictCheckRequest(
                    unit_id=payload.unit_id or current["unit_id"],
                    driver_id=payload.driver_id or current["driver_id"],
                    etd=payload.etd or current["etd"],
                    eta=fields["eta"] if "eta" in fields else current.get("eta"),
                    exclude_job_id=job_id,
                )
            )

        data: dict[str, Any] = {}
        if fields.get("customer_id"):
            data["customer_id"] = fields["customer_id"]
        if "pic_nama" in fields:
            data["pic_nama"] = clean_text(fields["pic_nama"])
        if "pic_no_hp" in fields:
            data["pic_no_hp"] = clean_text(fields["pic_no_hp"])
        for key in ("alat_diangkut", "asal", "tujuan"):
            if fields.get(key):
                data[key] = fields[key].strip()
        for key in ("unit_id", "driver_id"):
            if fields.get(key):
                data[key] = fields[key]
        if fields.get("etd"):
            data["etd"] = _to_iso(fields["etd"])
        if "eta" in fields:
            data["eta"] = _to_iso(fields["eta"]) if fields["eta"] else None
        if "catatan" in fields:
            data["catatan"] = clean_text(fields["catatan"])

        # Koordinat berubah → rute diambil ulang; titik yang tidak diubah pakai nilai lama.
        if _coords_changed(fields) and current is not None:
            coords = {
                key: fields[key] if key in fields else num_or_none(current.get(key))
                for key in ("asal_lat", "asal_lng", "tujuan_lat", "tujuan_lng")
            }
            data.update(coords)
            route = await try_get_route(
                coords["asal_lat"], coords["asal_lng"], coords["tujuan_lat"], coords["tujuan_lng"]
            )
            data["route_polyline"] = route.polyline if route else None
            data["route_distance_km"] = route.distance_km if route else None
            data["route_duration_min"] = route.duration_min if route else None

        if data:
            await self._db.table("jobs").update(data).eq("id", job_id).execute()

    async def update_status(self, job_id: str, payload: UpdateStatusRequest) -> None:
        await self._db.table("jobs").update({"status": payload.status}).eq("id", job_id).execute()
        notes = clean_text(payload.notes)
        if notes:
            latest = single(
                await self._db.table("job_status_history")
                .select("id")
                .eq("job_id", job_id)
                .order("changed_at", desc=True)
                .limit(1)
                .maybe_single()
                .execute()
            )
            if latest:
                await self._db.table("job_status_history").update({"notes": notes}).eq("id", latest["id"]).execute()

    async def cancel(self, job_id: str, payload: CancelRequest) -> None:
        await (
            self._db.table("jobs")
            .update({"status": "cancelled", "cancelled_reason": clean_text(payload.reason)})
            .eq("id", job_id)
            .execute()
        )


def _coords_changed(fields: dict[str, Any]) -> bool:
    return any(k in fields for k in ("asal_lat", "asal_lng", "tujuan_lat", "tujuan_lng"))
