from __future__ import annotations

import uuid
from typing import Any

from postgrest.exceptions import APIError
from postgrest.types import CountMethod
from supabase import AsyncClient

from app.core.dokumen import BerkasUnggah, PerubahanDokumen, signed_url_dokumen
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.core.paging import Page, PageParams, apply_window, build_page, ilike_any
from app.core.pg import clean_text, first, num, rows, single
from app.core.transaksi import Transaksi
from app.modules.asuransi.polis import PolisService
from app.modules.units.schemas import (
    BUKAN_ARMADA,
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
        status=row["status_operasional"],
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
        stnk_uploaded_at=row.get("stnk_uploaded_at"),
        kir_uploaded_at=row.get("kir_uploaded_at"),
    )


class UnitService:
    def __init__(self, client: AsyncClient) -> None:
        self._db = client

    # ── Baca ────────────────────────────────────────────────────────────────

    _SEARCH_COLUMNS = ["kode_unit", "no_polisi"]

    def _list_query(
        self,
        *,
        include_inactive: bool,
        q: str | None,
        jenis_unit_id: str | None,
        status: str | None,
        select: str,
        count=None,
        head: bool = False,
    ):
        query = (
            self._db.table("units").select(select, count=count, head=head)
            if count is not None
            else self._db.table("units").select(select)
        )
        if not include_inactive:
            query = query.eq("is_active", True)
        if jenis_unit_id:
            query = query.eq("jenis_unit_id", jenis_unit_id)
        if status:
            query = query.eq("status_operasional", status)
        if q and q.strip():
            query = query.or_(ilike_any(self._SEARCH_COLUMNS, q))
        return query

    async def list_page(
        self,
        *,
        params: PageParams,
        include_inactive: bool = False,
        q: str | None = None,
        jenis_unit_id: str | None = None,
        status: str | None = None,
    ) -> Page[Unit]:
        query = self._list_query(
            include_inactive=include_inactive,
            q=q,
            jenis_unit_id=jenis_unit_id,
            status=status,
            select=UNIT_SELECT,
            count=CountMethod.exact,
        )
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
        return to_unit(row).model_copy(
            update={
                "stnk_url": await signed_url_dokumen(self._db, row.get("stnk_path")),
                "kir_url": await signed_url_dokumen(self._db, row.get("kir_path")),
                "polis_terkini": await PolisService(self._db).terkini("unit", unit_id),
            }
        )

    async def count_active(self) -> int:
        res = await (
            self._db.table("units")
            .select("id", count=CountMethod.exact, head=True)
            .eq("is_active", True)
            .not_.in_("status_operasional", list(BUKAN_ARMADA))  # terjual/diafkirkan bukan lagi armada
            .execute()
        )
        return res.count or 0

    async def status_counts(self) -> UnitStatusCounts:
        res = await self._db.table("units").select("status_operasional").eq("is_active", True).execute()
        counts = UnitStatusCounts()
        for r in rows(res):
            status = r.get("status_operasional")
            if status in ("standby", "bertugas", "breakdown", "perbaikan", "terjual", "diafkirkan"):
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

    async def create(
        self,
        payload: UnitCreate,
        dokumen_stnk: BerkasUnggah | None = None,
        dokumen_kir: BerkasUnggah | None = None,
        dokumen_polis: BerkasUnggah | None = None,
    ) -> Unit:
        if not payload.kode_unit.strip():
            raise ValidationError("Kode unit wajib diisi")
        if not payload.no_polisi.strip():
            raise ValidationError("No polisi wajib diisi")
        if payload.default_driver_id:
            await self._ensure_driver_free(payload.default_driver_id)

        unit_id = str(uuid.uuid4())
        data: dict[str, Any] = {
            "id": unit_id,
            "kode_unit": payload.kode_unit.strip().upper(),
            "jenis_unit_id": payload.jenis_unit_id,
            "no_polisi": payload.no_polisi.strip(),
            "tahun": payload.tahun,
            "status_operasional": payload.status,
            "default_driver_id": payload.default_driver_id or None,
        }
        for key in _TEXT_FIELDS:
            data[key] = clean_text(getattr(payload, key))
        for key in _DATE_FIELDS:
            data[key] = getattr(payload, key) or None

        # File diunggah dulu; bila insert gagal, file dibuang lagi.
        dokumen = PerubahanDokumen(self._db, "units", unit_id)
        dokumen_polis_baru: PerubahanDokumen | None = None
        try:
            data.update(await dokumen.siapkan("stnk", dokumen_stnk))
            data.update(await dokumen.siapkan("kir", dokumen_kir))
            if payload.polis:
                # Unit + polis asuransi dalam satu transaksi.
                tx = Transaksi(self._db)
                tx.insert("units", data)
                dokumen_polis_baru = await PolisService(self._db).siapkan(
                    tx, jenis="unit", asset_id=unit_id, payload=payload.polis, dokumen=dokumen_polis
                )
                await tx.jalankan()
            else:
                await self._db.table("units").insert(data).execute()
        except APIError as exc:
            await dokumen.batalkan()
            if dokumen_polis_baru:
                await dokumen_polis_baru.batalkan()
            if exc.code == "23505":
                if "units_default_driver_unique" in (exc.message or ""):
                    raise ConflictError("Driver sudah dipakai unit lain") from exc
                raise ConflictError("Kode unit sudah dipakai") from exc
            raise
        except Exception:
            await dokumen.batalkan()
            if dokumen_polis_baru:
                await dokumen_polis_baru.batalkan()
            raise
        return await self.get(unit_id)

    async def update(
        self,
        unit_id: str,
        payload: UnitUpdate,
        dokumen_stnk: BerkasUnggah | None = None,
        dokumen_kir: BerkasUnggah | None = None,
        dokumen_polis: BerkasUnggah | None = None,
    ) -> None:
        fields = payload.model_dump(exclude_unset=True, exclude={"polis", "polis_id", "hapus_polis"})
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

        dokumen = PerubahanDokumen(self._db, "units", unit_id)
        if dokumen_stnk or dokumen_kir or payload.hapus_dokumen_stnk or payload.hapus_dokumen_kir:
            lama = single(
                await self._db.table("units").select("stnk_path, kir_path").eq("id", unit_id).maybe_single().execute()
            )
            if lama is None:
                raise NotFoundError("Unit tidak ditemukan")
            try:
                data.update(
                    await dokumen.siapkan(
                        "stnk", dokumen_stnk, hapus=payload.hapus_dokumen_stnk, lama=lama.get("stnk_path")
                    )
                )
                data.update(
                    await dokumen.siapkan(
                        "kir", dokumen_kir, hapus=payload.hapus_dokumen_kir, lama=lama.get("kir_path")
                    )
                )
            except Exception:
                await dokumen.batalkan()
                raise
        ubah_polis = payload.polis is not None or (payload.hapus_polis and payload.polis_id)
        if not data and not ubah_polis:
            return

        dokumen_polis_baru: PerubahanDokumen | None = None
        try:
            if ubah_polis:
                # Unit + polis asuransi dalam satu transaksi.
                tx = Transaksi(self._db)
                if data:
                    tx.update("units", data, {"id": unit_id})
                if payload.polis is not None:
                    dokumen_polis_baru = await PolisService(self._db).siapkan(
                        tx,
                        jenis="unit",
                        asset_id=unit_id,
                        payload=payload.polis,
                        dokumen=dokumen_polis,
                        polis_id=payload.polis_id,
                    )
                elif payload.polis_id:
                    tx.hapus("polis_asuransi", {"id": payload.polis_id, "unit_id": unit_id}, wajib=True)
                await tx.jalankan()
            else:
                await self._db.table("units").update(data).eq("id", unit_id).execute()
        except APIError as exc:
            await dokumen.batalkan()
            if dokumen_polis_baru:
                await dokumen_polis_baru.batalkan()
            if exc.code == "23505" and "units_default_driver_unique" in (exc.message or ""):
                raise ConflictError("Driver sudah dipakai unit lain") from exc
            raise
        except Exception:
            await dokumen.batalkan()
            if dokumen_polis_baru:
                await dokumen_polis_baru.batalkan()
            raise
        await dokumen.selesaikan()
        if dokumen_polis_baru:
            await dokumen_polis_baru.selesaikan()

    async def deactivate(self, unit_id: str) -> None:
        await self._db.table("units").update({"is_active": False}).eq("id", unit_id).execute()
