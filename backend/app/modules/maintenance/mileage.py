"""Sinkronisasi mileage harian dari TrackSolid ke `unit_odometer_snapshots`.

Logika gap-fill saat dibuka:
  1. Ambil totalMileage hari ini → UPSERT snapshot hari ini.
  2. Cari snapshot terbaru SEBELUM hari ini (lastDate).
  3. Kalau ada → loop lastDate s/d kemarin:
     - snapshot sudah final (fetched_at ≥ hari berikutnya 00:00 WIB) → lewati
     - belum / tidak ada → tarik jendela penuh hari itu & UPSERT
  4. Batasi MAX_BACKFILL_DAYS supaya panggilan ke TrackSolid terkendali.

Tanpa snapshot lampau sama sekali = sistem baru aktif; backfill dilewati agar
tidak menarik data sebelum sistem dipakai. Trigger DB menghitung ulang
`units.current_odometer_km` tiap snapshot berubah.

Snapshot ditulis lewat service role: tabelnya read-only untuk user biasa.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime

from pydantic import BaseModel
from supabase import AsyncClient

from app.core.errors import NotFoundError, ValidationError
from app.core.pg import num, num_or_none, rows, single
from app.core.timeutil import (
    WIB,
    add_days,
    date_range_inclusive,
    iso_utc,
    next_day_midnight_wib_as_utc,
    now_utc,
    parse_iso,
    today_wib,
)
from app.integrations.tracksolid.client import TrackSolidClient
from app.modules.maintenance.schemas import (
    BackfillFailure,
    BackfillSummary,
    MileageAtResponse,
    MileageBatchResponse,
    MileageEntry,
    SyncMileageResponse,
)

log = logging.getLogger(__name__)

MAX_BACKFILL_DAYS = 30
BACKFILL_PAUSE_S = 0.15
PER_UNIT_TIMEOUT_S = 50.0
PER_CALL_TIMEOUT_S = 8.0


class SyncResult(BaseModel):
    today_km: float
    yesterday_finalized: bool
    yesterday_km: float | None = None
    backfilled_dates: list[str]
    capped: bool


def _window_today(now: datetime) -> tuple[date, str, str]:
    wib = now.astimezone(WIB)
    tanggal = wib.date()
    return tanggal, f"{tanggal} 00:00:00", f"{tanggal} {wib.strftime('%H:%M:%S')}"


def _window_full_day(tanggal: date) -> tuple[str, str]:
    return f"{tanggal} 00:00:00", f"{tanggal} 23:59:59"


async def _upsert_snapshot(admin: AsyncClient, unit_id: str, tanggal: date, km: float) -> None:
    await (
        admin.table("unit_odometer_snapshots")
        .upsert(
            {
                "unit_id": unit_id,
                "tanggal": tanggal.isoformat(),
                "daily_km": km,
                "source": "tracksolid",
                "fetched_at": iso_utc(),
            },
            on_conflict="unit_id,tanggal",
        )
        .execute()
    )


async def sync_unit_mileage(
    admin: AsyncClient,
    tracksolid: TrackSolidClient,
    unit_id: str,
    imei: str,
    now: datetime | None = None,
) -> SyncResult:
    now = now or now_utc()
    today, start, end = _window_today(now)

    today_result = await tracksolid.get_daily_mileage(imei, start, end)
    await _upsert_snapshot(admin, unit_id, today, today_result.km)

    empty = SyncResult(today_km=today_result.km, yesterday_finalized=False, backfilled_dates=[], capped=False)

    last = single(
        await admin.table("unit_odometer_snapshots")
        .select("tanggal")
        .eq("unit_id", unit_id)
        .lt("tanggal", today.isoformat())
        .order("tanggal", desc=True)
        .limit(1)
        .maybe_single()
        .execute()
    )
    if not last or not last.get("tanggal"):
        return empty

    last_date = date.fromisoformat(last["tanggal"])
    yesterday = add_days(today, -1)
    if last_date > yesterday:
        return empty

    earliest = add_days(today, -MAX_BACKFILL_DAYS)
    from_date = max(last_date, earliest)
    capped = last_date < earliest
    target_dates = date_range_inclusive(from_date, yesterday)

    existing = await (
        admin.table("unit_odometer_snapshots")
        .select("tanggal, fetched_at")
        .eq("unit_id", unit_id)
        .in_("tanggal", [d.isoformat() for d in target_dates])
        .execute()
    )
    fetched_at = {r["tanggal"]: r["fetched_at"] for r in rows(existing)}

    backfilled: list[str] = []
    yesterday_km: float | None = None
    for tgl in target_dates:
        prev = fetched_at.get(tgl.isoformat())
        finalized = prev is not None and parse_iso(prev) >= next_day_midnight_wib_as_utc(tgl)
        if finalized:
            continue
        try:
            s, e = _window_full_day(tgl)
            r = await tracksolid.get_daily_mileage(imei, s, e)
            await _upsert_snapshot(admin, unit_id, tgl, r.km)
            backfilled.append(tgl.isoformat())
            if tgl == yesterday:
                yesterday_km = r.km
        except Exception as exc:  # noqa: BLE001 — tanggal ini gagal, polling berikutnya coba lagi
            log.warning("backfill %s %s gagal: %s", unit_id, tgl, exc)
        await asyncio.sleep(BACKFILL_PAUSE_S)

    return SyncResult(
        today_km=today_result.km,
        yesterday_finalized=yesterday.isoformat() in backfilled,
        yesterday_km=yesterday_km,
        backfilled_dates=backfilled,
        capped=capped,
    )


class MileageService:
    """Endpoint mileage. `user` = klien RLS (baca unit), `admin` = tulis snapshot."""

    def __init__(self, user: AsyncClient, admin: AsyncClient, tracksolid: TrackSolidClient) -> None:
        self._user = user
        self._admin = admin
        self._ts = tracksolid

    async def _units_with_imei(self, unit_id: str | None = None) -> list[dict[str, str]]:
        q = self._user.table("units").select("id, imei_gps").eq("is_active", True).not_.is_("imei_gps", "null")
        if unit_id:
            q = q.eq("id", unit_id)
        return [r for r in rows(await q.execute()) if r.get("imei_gps")]

    async def sync_all(self) -> MileageBatchResponse:
        units = await self._units_with_imei()

        async def one(u: dict[str, str]) -> tuple[str, MileageEntry | None]:
            try:
                res = await asyncio.wait_for(
                    sync_unit_mileage(self._admin, self._ts, u["id"], u["imei_gps"]),
                    timeout=PER_UNIT_TIMEOUT_S,
                )
                return u["id"], MileageEntry(km=res.today_km, fetched_at=iso_utc())
            except Exception as exc:  # noqa: BLE001 — satu unit gagal jangan blokir lainnya
                log.warning("sync mileage unit %s gagal: %s", u["id"], exc)
                return u["id"], None

        results = await asyncio.gather(*(one(u) for u in units))
        daily = dict(results)

        odometers: dict[str, float] = {}
        if units:
            refreshed = await (
                self._admin.table("units")
                .select("id, current_odometer_km")
                .in_("id", [u["id"] for u in units])
                .execute()
            )
            odometers = {r["id"]: num(r.get("current_odometer_km")) for r in rows(refreshed)}
        return MileageBatchResponse(daily=daily, odometers=odometers)

    async def sync_one(self, unit_id: str) -> SyncMileageResponse:
        unit = single(
            await self._user.table("units").select("id, imei_gps, is_active").eq("id", unit_id).maybe_single().execute()
        )
        if unit is None:
            raise NotFoundError("Unit tidak ditemukan")
        if not unit.get("imei_gps"):
            raise ValidationError("Unit belum punya IMEI GPS")

        res = await sync_unit_mileage(self._admin, self._ts, unit_id, unit["imei_gps"])
        fresh = single(
            await self._admin.table("units").select("current_odometer_km").eq("id", unit_id).maybe_single().execute()
        )
        return SyncMileageResponse(
            km=res.today_km,
            current_odometer_km=num_or_none((fresh or {}).get("current_odometer_km")),
        )

    async def mileage_at(self, unit_id: str, target: date) -> MileageAtResponse:
        """Akumulasi km unit pada akhir tanggal target = baseline + Σ daily_km ≤ target.

        Dipakai form servis saat admin backdate: kolom akumulasi km terisi dari
        sini, bukan dari pembacaan sekarang.
        """
        if target > today_wib():
            raise ValidationError("Tanggal tidak boleh di masa depan")

        unit = single(
            await self._user.table("units")
            .select("id, odometer_baseline_km, current_odometer_km")
            .eq("id", unit_id)
            .maybe_single()
            .execute()
        )
        if unit is None:
            raise NotFoundError("Unit tidak ditemukan")

        baseline = num(unit.get("odometer_baseline_km"))
        current = num(unit.get("current_odometer_km"))

        earliest_row = single(
            await self._user.table("unit_odometer_snapshots")
            .select("tanggal")
            .eq("unit_id", unit_id)
            .order("tanggal")
            .limit(1)
            .maybe_single()
            .execute()
        )
        earliest = (earliest_row or {}).get("tanggal")

        snaps = rows(
            await self._user.table("unit_odometer_snapshots")
            .select("tanggal, daily_km")
            .eq("unit_id", unit_id)
            .lte("tanggal", target.isoformat())
            .order("tanggal")
            .execute()
        )
        akumulasi = baseline + sum(num(r.get("daily_km")) for r in snaps)

        quality = "complete"
        missing: list[str] = []
        if not earliest or not snaps or target.isoformat() < earliest:
            quality = "no_data"
        else:
            expected = [d.isoformat() for d in date_range_inclusive(date.fromisoformat(earliest), target)]
            have = {r["tanggal"] for r in snaps}
            missing = [d for d in expected if d not in have]
            if missing:
                quality = "no_data" if len(missing) / len(expected) > 0.3 else "partial"

        no_data = quality == "no_data"
        return MileageAtResponse(
            date=target.isoformat(),
            akumulasi_km=None if no_data else round(akumulasi),
            current_akumulasi_km=round(current),
            km_after_target=None if no_data else round(max(0.0, current - akumulasi)),
            data_quality=quality,  # type: ignore[arg-type]
            missing_days=missing[:20],
            earliest_snapshot_date=earliest,
        )


async def backfill_mileage(
    admin: AsyncClient,
    tracksolid: TrackSolidClient,
    *,
    days: int,
    unit_id: str | None,
    force: bool,
) -> BackfillSummary:
    """Backfill N hari ke belakang untuk cron / seed awal. Hari ini tidak disentuh."""
    days = max(1, min(60, days))
    q = admin.table("units").select("id, imei_gps").eq("is_active", True).not_.is_("imei_gps", "null")
    if unit_id:
        q = q.eq("id", unit_id)
    units = [u for u in rows(await q.execute()) if u.get("imei_gps")]

    today = today_wib()
    target_dates = [add_days(today, -i) for i in range(days, 0, -1)]
    summary = BackfillSummary(days=days, units=len(units))

    existing: set[str] = set()
    if not force and units:
        res = await (
            admin.table("unit_odometer_snapshots")
            .select("unit_id, tanggal")
            .in_("unit_id", [u["id"] for u in units])
            .in_("tanggal", [d.isoformat() for d in target_dates])
            .execute()
        )
        existing = {f"{r['unit_id']}|{r['tanggal']}" for r in rows(res)}

    for u in units:
        for tgl in target_dates:
            if not force and f"{u['id']}|{tgl.isoformat()}" in existing:
                summary.skipped += 1
                continue
            try:
                s, e = _window_full_day(tgl)
                m = await asyncio.wait_for(
                    tracksolid.get_daily_mileage(u["imei_gps"], s, e), timeout=PER_CALL_TIMEOUT_S
                )
                await _upsert_snapshot(admin, u["id"], tgl, m.km)
                summary.inserted += 1
            except Exception as exc:  # noqa: BLE001
                summary.failed += 1
                summary.failures.append(BackfillFailure(unit_id=u["id"], tanggal=tgl.isoformat(), reason=str(exc)))
            await asyncio.sleep(BACKFILL_PAUSE_S)
    return summary
