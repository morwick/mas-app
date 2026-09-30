from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from supabase import AsyncClient

from app.core.errors import GoneError, NotFoundError, UpstreamError, ValidationError
from app.core.pg import first, rows, single
from app.core.timeutil import iso_utc, parse_iso
from app.integrations.tracksolid.client import CaptchaDiperlukanError, TrackSolidClient
from app.modules.jobs.mappers import PUBLIC_JOB_SELECT, active_children, to_job
from app.modules.tracking.schemas import (
    FleetLocationsResponse,
    LocationEntry,
    PublicDriver,
    PublicTrackingResponse,
    PublicUnit,
)

log = logging.getLogger(__name__)

# Link tracking customer masih bisa dibuka selama ini sesudah unloading tuntas.
# Batas yang berlaku ditegakkan RLS (transport.tracking_publik_aktif); nilai
# di sini hanya untuk ditampilkan, jadi harus sama dengan migrasinya.
LINK_BERLAKU_SETELAH_SELESAI = timedelta(hours=24)

PER_CALL_TIMEOUT_S = 5.0


async def _locate(tracksolid: TrackSolidClient, imei: str) -> LocationEntry:
    loc = await tracksolid.get_vehicle_location(imei)
    if loc.lat is None or loc.lng is None:
        raise UpstreamError("Device offline / belum pernah fix posisi")
    return LocationEntry(lat=loc.lat, lng=loc.lng, address=loc.address, fetched_at=iso_utc())


class FleetTrackingService:
    """Lokasi real-time unit untuk admin."""

    def __init__(self, client: AsyncClient, tracksolid: TrackSolidClient) -> None:
        self._db = client
        self._ts = tracksolid

    async def all_locations(self) -> FleetLocationsResponse:
        """Semua unit aktif ber-IMEI; satu unit gagal tidak memblokir lainnya."""
        res = await (
            self._db.table("units").select("id, imei_gps").eq("is_active", True).not_.is_("imei_gps", "null").execute()
        )
        units = rows(res)
        if units:
            # Sesi TrackSolid tidak valid → langsung galat "butuh captcha"
            # (frontend memunculkan popup), bukan semua lokasi kosong diam-diam.
            await self._ts.pastikan_sesi()

        async def one(u: dict[str, str]) -> tuple[str, LocationEntry | None]:
            if not u.get("imei_gps"):
                return u["id"], None
            try:
                return u["id"], await asyncio.wait_for(_locate(self._ts, u["imei_gps"]), timeout=PER_CALL_TIMEOUT_S)
            except CaptchaDiperlukanError:
                raise
            except Exception:  # noqa: BLE001
                return u["id"], None

        return FleetLocationsResponse(locations=dict(await asyncio.gather(*(one(u) for u in units))))

    async def unit_location(self, unit_id: str) -> LocationEntry:
        unit = single(await self._db.table("units").select("id, imei_gps").eq("id", unit_id).maybe_single().execute())
        if unit is None:
            raise NotFoundError("Unit tidak ditemukan")
        if not unit.get("imei_gps"):
            raise ValidationError("Unit belum punya IMEI tracking")
        return await _locate(self._ts, unit["imei_gps"])


class PublicTrackingService:
    """Halaman pelacakan pelanggan — klien anon dengan header x-share-token."""

    def __init__(self, client: AsyncClient, tracksolid: TrackSolidClient) -> None:
        self._db = client
        self._ts = tracksolid

    async def get(self, token: str) -> PublicTrackingResponse:
        row = single(
            await active_children(self._db.table("jobs").select(PUBLIC_JOB_SELECT), PUBLIC_JOB_SELECT)
            .eq("share_token", token)
            .maybe_single()
            .execute()
        )
        # Token tidak ada ATAU RLS menutup job-nya (dibatalkan, atau sudah lewat
        # 24 jam sejak unloading tuntas — lihat transport.tracking_publik_aktif) —
        # bagi pelanggan artinya sama: tautan sudah berakhir.
        if row is None:
            raise GoneError("Link tracking sudah berakhir")
        job = to_job(row)
        if job.status == "cancelled":
            raise GoneError("Link tracking sudah berakhir")
        unloading_selesai_at = row.get("unloading_selesai_at")
        berlaku_sampai = (
            iso_utc(parse_iso(unloading_selesai_at) + LINK_BERLAKU_SETELAH_SELESAI) if unloading_selesai_at else None
        )
        # Foto serah terima di pool adalah proses internal — bukan urusan customer.
        job = job.model_copy(update={"photos": [p for p in job.photos if p.stage != "serah_terima"]})

        unit_res, driver_res = await asyncio.gather(
            self._db.table("units")
            .select("id, kode_unit, no_polisi, tracksolid_share_link, jenis_unit(nama)")
            .eq("id", job.unit_id)
            .maybe_single()
            .execute(),
            self._db.table("drivers").select("id, nama, no_hp").eq("id", job.driver_id).maybe_single().execute(),
        )
        unit_row = single(unit_res)
        driver_row = single(driver_res)
        return PublicTrackingResponse(
            job=job,
            unit=(
                PublicUnit(
                    kode_unit=unit_row["kode_unit"],
                    no_polisi=unit_row["no_polisi"],
                    jenis=(first(unit_row.get("jenis_unit")) or {}).get("nama") or "—",
                    tracksolid_share_link=unit_row.get("tracksolid_share_link"),
                )
                if unit_row
                else None
            ),
            driver=PublicDriver(nama=driver_row["nama"], no_hp=driver_row["no_hp"]) if driver_row else None,
            selesai=unloading_selesai_at is not None,
            berlaku_sampai=berlaku_sampai,
        )

    async def location(self, token: str) -> LocationEntry:
        """410 = job usai → klien berhenti polling; 422 = tanpa IMEI → fallback link;
        502 = TrackSolid bermasalah → coba lagi interval berikutnya."""
        row = single(
            await self._db.table("jobs")
            .select("id, status_job, unloading_selesai_at, unit_id, units!inner(imei_gps)")
            .eq("share_token", token)
            .maybe_single()
            .execute()
        )
        if row is None:
            raise GoneError("Job tidak ditemukan atau sudah selesai")
        # Job dibatalkan → link langsung berakhir (RLS juga menutupnya; ini
        # pagar kedua supaya posisi truk tidak pernah terkirim).
        if row.get("status_job") == "cancelled":
            raise GoneError("Link tracking sudah berakhir")
        # Setelah unloading tuntas truk kembali ke pool — posisinya bukan lagi
        # urusan customer, dan halaman berhenti polling saat menerima 410.
        if row.get("unloading_selesai_at"):
            raise GoneError("Pengiriman sudah selesai")
        imei = (first(row.get("units")) or {}).get("imei_gps")
        if not imei:
            raise ValidationError("Unit belum punya IMEI tracking")
        return await _locate(self._ts, imei)
