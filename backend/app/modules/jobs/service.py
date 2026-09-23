from __future__ import annotations

from datetime import timedelta
from typing import Any

from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.errors import AppError, NotFoundError, ValidationError
from app.core.pg import clean_text, first, num_or_none, rows, single
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.core.push import push_to_driver
from app.core.timeutil import iso_utc, parse_date, parse_iso, today_wib
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
    ReturnJobRequest,
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


def _reject_back_dated_etd(etd: str) -> None:
    """ETD tidak boleh mundur ke tanggal yang sudah lewat (jam bebas).

    Dibandingkan sebagai tanggal kalender apa adanya — bukan sebagai instan —
    supaya hasilnya sama dengan tanggal yang dipilih admin di browser.
    """
    if parse_date(etd) < today_wib():
        raise ValidationError("Tanggal pickup (ETD) tidak boleh tanggal yang sudah lewat.")


def _reject_eta_before_etd(etd: str, eta: str | None) -> None:
    if eta and parse_iso(eta) < parse_iso(etd):
        raise ValidationError("Estimasi sampai (ETA) tidak boleh lebih awal dari ETD.")


class JobService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    # ── Baca ────────────────────────────────────────────────────────────────

    # Kolom yang ikut dicari dari kotak pencarian daftar job.
    # Hanya kolom milik tabel jobs. `customer_nama` datang dari embed
    # customers dan tidak bisa ikut ke dalam grup `or=` yang sama.
    _SEARCH_COLUMNS = ["job_number", "alat_diangkut", "asal", "tujuan"]

    def _list_query(
        self,
        *,
        status: JobListFilter,
        customer_id: str | None,
        q: str | None,
        select: str,
        count: CountMethod | None = None,
        head: bool = False,
    ):
        """Query daftar job dengan seluruh filternya — dipakai bersama oleh
        pengambilan halaman dan penghitungan baris, supaya keduanya tidak
        pernah memakai kriteria yang berbeda."""
        query = (
            self._db.table("jobs").select(select, count=count, head=head)
            if count is not None
            else self._db.table("jobs").select(select)
        )
        if status == "active":
            query = query.in_("status", list(ACTIVE_JOB_STATUSES))
        elif status in ("menunggu_validasi", "selesai", "cancelled"):
            query = query.eq("status", status)
        if customer_id:
            query = query.eq("customer_id", customer_id)
        if q and q.strip():
            query = query.or_(ilike_any(self._SEARCH_COLUMNS, q))
        return query

    async def list_page(
        self,
        *,
        params: PageParams,
        status: JobListFilter = "all",
        customer_id: str | None = None,
        q: str | None = None,
    ) -> Page[Job]:
        """Satu halaman job. Pencarian & filter dijalankan di database — kalau
        disaring di browser, yang tersaring hanya halaman yang sedang tampil."""
        query = self._list_query(
            status=status, customer_id=customer_id, q=q, select=JOB_SELECT, count=CountMethod.exact
        )
        res = await apply_window(query.order("created_at", desc=True), params).execute()
        return build_page([to_job(r) for r in rows(res)], res.count, params)

    async def list_all(self, *, status: JobListFilter = "all", customer_id: str | None = None) -> list[Job]:
        """Seluruh baris tanpa potongan — untuk deteksi bentrok jadwal dan
        ekspor, yang memang butuh melihat semuanya."""
        query = self._list_query(status=status, customer_id=customer_id, q=None, select=JOB_SELECT)
        return [to_job(r) for r in rows(await query.order("created_at", desc=True).execute())]

    async def tab_counts(self, *, customer_id: str | None = None, q: str | None = None) -> dict[str, int]:
        """Jumlah per tab, dihitung di database dengan filter yang sama persis
        seperti daftarnya — supaya angka di tab cocok dengan isinya."""
        tabs: list[JobListFilter] = ["active", "menunggu_validasi", "selesai", "cancelled"]
        out: dict[str, int] = {}
        for tab in tabs:
            res = await self._list_query(
                status=tab, customer_id=customer_id, q=q, select="id", count=CountMethod.exact, head=True
            ).execute()
            out[tab] = res.count or 0
        return out

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

    async def count_by_status(self, status: str) -> int:
        res = await (
            self._db.table("jobs").select("id", count=CountMethod.exact, head=True).eq("status", status).execute()
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
        _reject_back_dated_etd(payload.etd)
        _reject_eta_before_etd(payload.etd, payload.eta)

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
        # FR-JOB-03: ETA kosong diisi dari durasi rute dan ditandai estimasi sistem.
        eta_iso = _to_iso(payload.eta) if payload.eta else None
        eta_is_estimated = False
        if eta_iso is None and route is not None:
            eta_iso = iso_utc(parse_iso(payload.etd) + timedelta(minutes=route.duration_min))
            eta_is_estimated = True
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
            "eta": eta_iso,
            "eta_is_estimated": eta_is_estimated,
            "uang_jalan_pagu": payload.uang_jalan_pagu,
            "catatan": clean_text(payload.catatan),
            "quotation_id": payload.quotation_id or None,
            "created_by": created_by,
        }
        res = await self._db.table("jobs").insert(data).execute()
        row = rows(res)[0]
        await push_to_driver(
            payload.driver_id,
            title="Job baru untuk Anda",
            body=f"{row['job_number']} — {payload.asal.strip()} → {payload.tujuan.strip()}",
            data={"job_id": row["id"], "kind": "job_baru"},
        )
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

        if touches_schedule and current is not None:
            # ETD/ETA dibandingkan setelah digabung dengan nilai tersimpan, supaya
            # mengubah salah satunya saja tetap terjaga urutannya.
            merged_etd = payload.etd or current["etd"]
            merged_eta = fields["eta"] if "eta" in fields else current.get("eta")
            _reject_eta_before_etd(merged_etd, merged_eta)
            # Larangan back-date sengaja tidak diterapkan di sini: job yang sudah
            # berjalan wajar punya ETD di masa lalu, dan form edit selalu mengirim
            # ulang ETD lama apa adanya.

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
            data["eta_is_estimated"] = False
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
        res = await (
            self._db.table("jobs")
            .update({"status": "cancelled", "cancelled_reason": clean_text(payload.reason)})
            .eq("id", job_id)
            .execute()
        )
        reason = clean_text(payload.reason)
        for row in rows(res):
            await push_to_driver(
                row["driver_id"],
                title="Job dibatalkan",
                body=row["job_number"] + (f": {reason}" if reason else ""),
                data={"job_id": job_id, "kind": "job_dibatalkan"},
            )

    # ── Validasi admin (Fase 7) ─────────────────────────────────────────────

    async def validate(self, job_id: str) -> str:
        """Approve: menunggu_validasi → selesai; driver & unit dibebaskan (BR-01, BR-07)."""
        res = await self._db.rpc("admin_validate_job", {"p_job_id": job_id}).execute()
        job = await self.get(job_id)
        await push_to_driver(
            job.driver_id,
            title="Job divalidasi admin",
            body=f"{job.job_number} selesai. Anda kembali Stand By.",
            data={"job_id": job_id, "kind": "job_divalidasi"},
        )
        return str(res.data)

    async def return_to_driver(self, job_id: str, payload: ReturnJobRequest) -> str:
        res = await self._db.rpc(
            "admin_return_job",
            {"p_job_id": job_id, "p_note": payload.note.strip(), "p_to_status": payload.to_status},
        ).execute()
        job = await self.get(job_id)
        await push_to_driver(
            job.driver_id,
            title="Job dikembalikan admin",
            body=f"{job.job_number}: {payload.note.strip()}",
            data={"job_id": job_id, "kind": "job_dikembalikan"},
        )
        return str(res.data)


def _coords_changed(fields: dict[str, Any]) -> bool:
    return any(k in fields for k in ("asal_lat", "asal_lng", "tujuan_lat", "tujuan_lng"))
