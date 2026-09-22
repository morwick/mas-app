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
