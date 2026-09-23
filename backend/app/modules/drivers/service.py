from __future__ import annotations

from typing import Any

from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.errors import NotFoundError
from app.core.pg import clean_text, rows, single
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.domain.job_conflicts import ACTIVE_JOB_STATUSES
from app.modules.drivers.schemas import Driver, DriverCreate, DriverUpdate


def _to_driver(row: dict[str, Any]) -> Driver:
    return Driver(
        id=row["id"],
        nama=row["nama"],
        no_hp=row["no_hp"],
        no_sim=row.get("no_sim"),
        sim_berlaku_sampai=row.get("sim_berlaku_sampai"),
        alamat=row.get("alamat"),
        catatan=row.get("catatan"),
        is_active=bool(row.get("is_active", True)),
        created_at=row["created_at"],
        pin_updated_at=row.get("pin_updated_at"),
    )


class DriverService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    async def _active_jobs_by_driver(self, driver_ids: list[str] | None = None) -> dict[str, dict[str, Any]]:
        """driver_id → job aktif (BR-01). Satu driver paling banyak satu job aktif."""
        q = self._db.table("jobs").select("id, job_number, driver_id").in_("status", list(ACTIVE_JOB_STATUSES))
        if driver_ids:
            q = q.in_("driver_id", driver_ids)
        return {r["driver_id"]: r for r in rows(await q.execute())}

    @staticmethod
    def _with_status(driver: Driver, active: dict[str, Any] | None) -> Driver:
        if active:
            return driver.model_copy(
                update={"status": "in_job", "active_job_id": active["id"], "active_job_number": active["job_number"]}
            )
        return driver

    _SEARCH_COLUMNS = ["nama", "no_hp", "no_sim"]

    async def list_page(self, *, params: PageParams, include_inactive: bool = False,
                        q: str | None = None) -> Page[Driver]:
        """Satu halaman driver. Status (stand_by/in_job) diturunkan dari job
        aktif setelah pemotongan — kolomnya tidak ada di tabel, jadi tidak bisa
        ikut jadi kriteria filter di database."""
        query = self._db.table("drivers").select("*", count=CountMethod.exact)
        if not include_inactive:
            query = query.eq("is_active", True)
        if q and q.strip():
            query = query.or_(ilike_any(self._SEARCH_COLUMNS, q))
        res = await apply_window(query.order("nama"), params).execute()
        drivers = [_to_driver(r) for r in rows(res)]
        active = await self._active_jobs_by_driver()
        return build_page([self._with_status(d, active.get(d.id)) for d in drivers], res.count, params)

    async def count_by_active(self, *, q: str | None = None) -> dict[str, int]:
        """Jumlah untuk chip Aktif/Nonaktif, mengikuti kata kunci yang sedang aktif."""
        out: dict[str, int] = {}
        for key, flag in (("active", True), ("inactive", False)):
            query = self._db.table("drivers").select("id", count=CountMethod.exact, head=True).eq("is_active", flag)
            if q and q.strip():
                query = query.or_(ilike_any(self._SEARCH_COLUMNS, q))
            out[key] = (await query.execute()).count or 0
        out["all"] = out["active"] + out["inactive"]
        return out

    async def list_all(self, *, include_inactive: bool = False, only_stand_by: bool = False) -> list[Driver]:
        q = self._db.table("drivers").select("*").order("nama")
        if not include_inactive:
            q = q.eq("is_active", True)
        drivers = [_to_driver(r) for r in rows(await q.execute())]
        active = await self._active_jobs_by_driver()
        out = [self._with_status(d, active.get(d.id)) for d in drivers]
        if only_stand_by:
            out = [d for d in out if d.status == "stand_by"]
        return out

    async def get(self, driver_id: str) -> Driver:
        row = single(await self._db.table("drivers").select("*").eq("id", driver_id).maybe_single().execute())
        if row is None:
            raise NotFoundError("Driver tidak ditemukan")
        active = await self._active_jobs_by_driver([driver_id])
        return self._with_status(_to_driver(row), active.get(driver_id))

    async def count_active(self) -> int:
        res = await (
            self._db.table("drivers").select("id", count=CountMethod.exact, head=True).eq("is_active", True).execute()
        )
        return res.count or 0

    async def create(self, payload: DriverCreate) -> Driver:
        res = await (
            self._db.table("drivers")
            .insert(
                {
                    "nama": payload.nama.strip(),
                    "no_hp": payload.no_hp.strip(),
                    "no_sim": clean_text(payload.no_sim),
                    "sim_berlaku_sampai": payload.sim_berlaku_sampai or None,
                    "alamat": clean_text(payload.alamat),
                    "catatan": clean_text(payload.catatan),
                }
            )
            .execute()
        )
        return _to_driver(rows(res)[0])

    async def update(self, driver_id: str, payload: DriverUpdate) -> None:
        data: dict[str, Any] = {}
        fields = payload.model_dump(exclude_unset=True)
        if "nama" in fields and payload.nama is not None:
            data["nama"] = payload.nama.strip()
        if "no_hp" in fields and payload.no_hp is not None:
            data["no_hp"] = payload.no_hp.strip()
        for key in ("no_sim", "alamat", "catatan"):
            if key in fields:
                data[key] = clean_text(fields[key])
        if "sim_berlaku_sampai" in fields:
            data["sim_berlaku_sampai"] = fields["sim_berlaku_sampai"] or None
        if data:
            await self._db.table("drivers").update(data).eq("id", driver_id).execute()

    async def deactivate(self, driver_id: str) -> None:
        await self._db.table("drivers").update({"is_active": False}).eq("id", driver_id).execute()

    async def set_pin(self, driver_id: str, pin: str) -> None:
        """Hash dikerjakan fungsi DB `admin_set_driver_pin`; PIN mentah tidak pernah
        disimpan. Fungsi itu juga mencabut semua sesi lama driver."""
        await self._db.rpc("admin_set_driver_pin", {"p_driver_id": driver_id, "p_pin": pin}).execute()
