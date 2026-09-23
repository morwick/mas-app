from __future__ import annotations

from typing import Any

from postgrest.exceptions import APIError
from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.pg import clean_text, first, num, rows, single
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.modules.units.schemas import (
    ChangeStatusRequest,
    DriverAssignment,
    Unit,
    UnitCreate,
    UnitStatusCounts,
    UnitStatusHistoryEntry,
    UnitUpdate,
)

UNIT_SELECT = """
  *,
  jenis_unit(nama),
  default_driver:drivers!units_default_driver_id_fkey(id, nama, no_hp)
"""

_DATE_FIELDS = ("stnk_berlaku_sampai", "kir_berlaku_sampai", "pajak_berlaku_sampai")
_TEXT_FIELDS = ("catatan", "imei_gps", "tracksolid_share_link", "stnk_nomor", "kir_nomor")


def to_unit(row: dict[str, Any]) -> Unit:
    jenis = first(row.get("jenis_unit"))
    driver = first(row.get("default_driver"))
    return Unit(
        id=row["id"],
        kode_unit=row["kode_unit"],
        jenis_unit_id=row["jenis_unit_id"],
        jenis_unit_nama=(jenis or {}).get("nama") or "—",
        no_polisi=row["no_polisi"],
        tahun=row.get("tahun"),
        status=row["status"],
        catatan=row.get("catatan"),
        is_active=bool(row.get("is_active", True)),
        created_at=row["created_at"],
        default_driver_id=row.get("default_driver_id"),
        default_driver_nama=(driver or {}).get("nama"),
        default_driver_no_hp=(driver or {}).get("no_hp"),
        imei_gps=row.get("imei_gps"),
        tracksolid_share_link=row.get("tracksolid_share_link"),
        odometer_baseline_km=num(row.get("odometer_baseline_km")),
        current_odometer_km=num(row.get("current_odometer_km")),
        service_interval_km=num(row.get("service_interval_km"), 10_000),
        stnk_nomor=row.get("stnk_nomor"),
        stnk_berlaku_sampai=row.get("stnk_berlaku_sampai"),
        kir_nomor=row.get("kir_nomor"),
        kir_berlaku_sampai=row.get("kir_berlaku_sampai"),
        pajak_berlaku_sampai=row.get("pajak_berlaku_sampai"),
    )


class UnitService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    # ── Baca ────────────────────────────────────────────────────────────────

    _SEARCH_COLUMNS = ["kode_unit", "no_polisi"]

    def _list_query(self, *, include_inactive: bool, q: str | None, jenis_unit_id: str | None,
                    status: str | None, select: str, count=None, head: bool = False):
        query = (self._db.table("units").select(select, count=count, head=head)
                 if count is not None else self._db.table("units").select(select))
        if not include_inactive:
            query = query.eq("is_active", True)
        if jenis_unit_id:
            query = query.eq("jenis_unit_id", jenis_unit_id)
        if status:
            query = query.eq("status", status)
        if q and q.strip():
            query = query.or_(ilike_any(self._SEARCH_COLUMNS, q))
        return query

    async def list_page(self, *, params: PageParams, include_inactive: bool = False,
                        q: str | None = None, jenis_unit_id: str | None = None,
                        status: str | None = None) -> Page[Unit]:
        query = self._list_query(include_inactive=include_inactive, q=q, jenis_unit_id=jenis_unit_id,
                                 status=status, select=UNIT_SELECT, count=CountMethod.exact)
        res = await apply_window(query.order("kode_unit"), params).execute()
        return build_page([to_unit(r) for r in rows(res)], res.count, params)

    async def list_all(self, *, include_inactive: bool = False) -> list[Unit]:
        """Seluruh baris — dipakai dropdown form dan dashboard."""
        q = self._db.table("units").select(UNIT_SELECT).order("kode_unit")
        if not include_inactive:
            q = q.eq("is_active", True)
        return [to_unit(r) for r in rows(await q.execute())]

    async def get(self, unit_id: str) -> Unit:
        row = single(await self._db.table("units").select(UNIT_SELECT).eq("id", unit_id).maybe_single().execute())
        if row is None:
            raise NotFoundError("Unit tidak ditemukan")
        return to_unit(row)

    async def count_active(self) -> int:
        res = await (
            self._db.table("units").select("id", count=CountMethod.exact, head=True).eq("is_active", True).execute()
        )
        return res.count or 0

    async def status_counts(self) -> UnitStatusCounts:
        res = await self._db.table("units").select("status").eq("is_active", True).execute()
        counts = UnitStatusCounts()
        for r in rows(res):
            status = r.get("status")
            if status in ("standby", "bertugas", "perbaikan"):
                setattr(counts, status, getattr(counts, status) + 1)
        return counts

    async def status_history(self, unit_id: str) -> list[UnitStatusHistoryEntry]:
        res = await (
            self._db.table("unit_status_history")
            .select("*, profiles(nama)")
            .eq("unit_id", unit_id)
            .order("changed_at", desc=True)
            .execute()
        )
        return [
            UnitStatusHistoryEntry(
                id=r["id"],
                unit_id=r["unit_id"],
                status_old=r.get("status_old"),
                status_new=r["status_new"],
                changed_by_nama=(first(r.get("profiles")) or {}).get("nama") or "Sistem",
                changed_at=r["changed_at"],
                reason=r.get("reason"),
            )
            for r in rows(res)
        ]

    async def driver_assignments(self) -> dict[str, DriverAssignment]:
        """driver_id → unit aktif yang memakainya sebagai driver tetap."""
        res = await (
            self._db.table("units")
            .select("id, kode_unit, default_driver_id")
            .eq("is_active", True)
            .not_.is_("default_driver_id", "null")
            .execute()
        )
        return {r["default_driver_id"]: DriverAssignment(unit_id=r["id"], kode_unit=r["kode_unit"]) for r in rows(res)}

    # ── Tulis ───────────────────────────────────────────────────────────────

    async def _driver_taken_by(self, driver_id: str, exclude_unit_id: str | None = None) -> str | None:
        q = self._db.table("units").select("kode_unit").eq("default_driver_id", driver_id).eq("is_active", True)
        if exclude_unit_id:
            q = q.neq("id", exclude_unit_id)
        row = single(await q.limit(1).maybe_single().execute())
        return row["kode_unit"] if row else None

    async def _ensure_driver_free(self, driver_id: str, exclude_unit_id: str | None = None) -> None:
        taken_by = await self._driver_taken_by(driver_id, exclude_unit_id)
        if taken_by:
            raise ConflictError(
                f"Driver sudah jadi driver tetap unit {taken_by}. Lepas dari unit itu dulu sebelum di-assign ke sini."
            )

    async def create(self, payload: UnitCreate) -> Unit:
        if not payload.kode_unit.strip():
            raise ValidationError("Kode unit wajib diisi")
        if not payload.no_polisi.strip():
            raise ValidationError("No polisi wajib diisi")
        if payload.default_driver_id:
            await self._ensure_driver_free(payload.default_driver_id)

        data: dict[str, Any] = {
            "kode_unit": payload.kode_unit.strip().upper(),
            "jenis_unit_id": payload.jenis_unit_id,
            "no_polisi": payload.no_polisi.strip(),
            "tahun": payload.tahun,
            "status": payload.status,
            "default_driver_id": payload.default_driver_id or None,
        }
        for key in _TEXT_FIELDS:
            data[key] = clean_text(getattr(payload, key))
        for key in _DATE_FIELDS:
            data[key] = getattr(payload, key) or None

        try:
            res = await self._db.table("units").insert(data).execute()
        except APIError as exc:
            if exc.code == "23505":
                if "units_default_driver_unique" in (exc.message or ""):
                    raise ConflictError("Driver sudah dipakai unit lain") from exc
                raise ConflictError("Kode unit sudah dipakai") from exc
            raise
        return await self.get(rows(res)[0]["id"])

    async def update(self, unit_id: str, payload: UnitUpdate) -> None:
        fields = payload.model_dump(exclude_unset=True)
        if payload.default_driver_id:
            await self._ensure_driver_free(payload.default_driver_id, unit_id)

        data: dict[str, Any] = {}
        if fields.get("kode_unit"):
            data["kode_unit"] = fields["kode_unit"].strip().upper()
        if fields.get("jenis_unit_id"):
            data["jenis_unit_id"] = fields["jenis_unit_id"]
        if fields.get("no_polisi"):
            data["no_polisi"] = fields["no_polisi"].strip()
        if "tahun" in fields:
            data["tahun"] = fields["tahun"]
        if "default_driver_id" in fields:
            data["default_driver_id"] = fields["default_driver_id"] or None
        for key in _TEXT_FIELDS:
            if key in fields:
                data[key] = clean_text(fields[key])
        for key in _DATE_FIELDS:
            if key in fields:
                data[key] = fields[key] or None
        if not data:
            return

        try:
            await self._db.table("units").update(data).eq("id", unit_id).execute()
        except APIError as exc:
            if exc.code == "23505" and "units_default_driver_unique" in (exc.message or ""):
                raise ConflictError("Driver sudah dipakai unit lain") from exc
            raise

    async def change_status(self, unit_id: str, payload: ChangeStatusRequest) -> None:
        # Log riwayat dibuat trigger DB; alasan ditambahkan terpisah ke baris terbaru.
        await self._db.table("units").update({"status": payload.status}).eq("id", unit_id).execute()
        reason = clean_text(payload.reason)
        if reason:
            latest = single(
                await self._db.table("unit_status_history")
                .select("id")
                .eq("unit_id", unit_id)
                .order("changed_at", desc=True)
                .limit(1)
                .maybe_single()
                .execute()
            )
            if latest:
                await self._db.table("unit_status_history").update({"reason": reason}).eq("id", latest["id"]).execute()

    async def deactivate(self, unit_id: str) -> None:
        await self._db.table("units").update({"is_active": False}).eq("id", unit_id).execute()
