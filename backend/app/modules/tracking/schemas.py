from __future__ import annotations

from pydantic import BaseModel

from app.modules.jobs.schemas import Job


class LocationEntry(BaseModel):
    lat: float
    lng: float
    address: str | None
    fetched_at: str


class FleetLocationsResponse(BaseModel):
    locations: dict[str, LocationEntry | None]


class PublicUnit(BaseModel):
    kode_unit: str
    no_polisi: str
    jenis: str
    tracksolid_share_link: str | None


class PublicDriver(BaseModel):
    nama: str
    no_hp: str


class PublicTrackingResponse(BaseModel):
    job: Job
    unit: PublicUnit | None
    driver: PublicDriver | None
    # Bagi customer, job selesai begitu driver menuntaskan unloading (4 foto sisi
    # kendaraan + surat jalan). Status internal sesudahnya (pool, validasi) tidak
    # ditampilkan.
    selesai: bool = False
    # Batas link bisa dibuka: waktu unloading tuntas + 24 jam (null = job belum selesai).
    berlaku_sampai: str | None = None
