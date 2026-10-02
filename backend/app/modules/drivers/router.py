from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from supabase import AsyncClient

from app.core.auth import user_client
from app.core.dokumen import baca_berkas, parse_form
from app.core.paging import Page, PageParams, page_params
from app.modules.auth.schemas import OkResponse
from app.modules.drivers.schemas import (
    Driver,
    DriverCreate,
    DriverUpdate,
    KaryawanDriverOption,
    KasbonDriverRingkas,
    SetPinRequest,
)
from app.modules.drivers.service import DriverService, kasbon_driver
from app.modules.jobs.schemas import Job
from app.modules.jobs.service import JobService

router = APIRouter(prefix="/drivers", tags=["drivers"])


def get_service(client: AsyncClient = Depends(user_client)) -> DriverService:
    return DriverService(client)


@router.get("/page", response_model=Page[Driver])
async def list_drivers_page(
    include_inactive: bool = Query(False),
    q: str | None = Query(None, description="Cari nama, no HP, atau no SIM"),
    params: PageParams = Depends(page_params),
    svc: DriverService = Depends(get_service),
) -> Page[Driver]:
    return await svc.list_page(params=params, include_inactive=include_inactive, q=q)


@router.get("/counts", response_model=dict[str, int])
async def driver_counts(q: str | None = Query(None), svc: DriverService = Depends(get_service)) -> dict[str, int]:
    return await svc.count_by_active(q=q)


@router.get("", response_model=list[Driver])
async def list_drivers(
    include_inactive: bool = Query(False),
    only_stand_by: bool = Query(False, description="Hanya driver yang tidak sedang In Job (BR-01)"),
    svc: DriverService = Depends(get_service),
) -> list[Driver]:
    """Tanpa potongan — untuk dropdown driver di form job."""
    return await svc.list_all(include_inactive=include_inactive, only_stand_by=only_stand_by)


@router.get("/karyawan-pilihan", response_model=list[KaryawanDriverOption])
async def karyawan_pilihan(svc: DriverService = Depends(get_service)) -> list[KaryawanDriverOption]:
    """Pilihan nama di form tambah/edit driver: semua karyawan aktif."""
    return await svc.karyawan_pilihan()


@router.get("/{driver_id}", response_model=Driver)
async def get_driver(driver_id: str, svc: DriverService = Depends(get_service)) -> Driver:
    return await svc.get(driver_id)


@router.get("/{driver_id}/kasbon", response_model=KasbonDriverRingkas)
async def driver_kasbon(driver_id: str, client: AsyncClient = Depends(user_client)) -> KasbonDriverRingkas:
    """Riwayat & total kasbon supir (dari ganti driver / ganti unit)."""
    return await kasbon_driver(client, driver_id)


@router.get("/{driver_id}/jobs", response_model=list[Job])
async def driver_jobs(driver_id: str, client: AsyncClient = Depends(user_client)) -> list[Job]:
    """Semua job driver ini (terbaru dulu) — untuk halaman detail driver."""
    return await JobService(client).list_by_driver(driver_id)


@router.post("", response_model=Driver, status_code=201)
async def create_driver(
    data: str = Form(..., description="Isian DriverCreate (JSON)"),
    dokumen_sim: UploadFile | None = File(None, description="Scan/foto SIM (opsional)"),
    svc: DriverService = Depends(get_service),
) -> Driver:
    return await svc.create(parse_form(DriverCreate, data), await baca_berkas(dokumen_sim))


@router.patch("/{driver_id}", response_model=OkResponse)
async def update_driver(
    driver_id: str,
    data: str = Form(..., description="Isian DriverUpdate (JSON)"),
    dokumen_sim: UploadFile | None = File(None, description="Scan/foto SIM pengganti (opsional)"),
    svc: DriverService = Depends(get_service),
) -> OkResponse:
    await svc.update(driver_id, parse_form(DriverUpdate, data), await baca_berkas(dokumen_sim))
    return OkResponse()


@router.post("/{driver_id}/deactivate", response_model=OkResponse)
async def deactivate_driver(driver_id: str, svc: DriverService = Depends(get_service)) -> OkResponse:
    await svc.deactivate(driver_id)
    return OkResponse()


@router.post("/{driver_id}/pin", response_model=OkResponse)
async def set_driver_pin(
    driver_id: str, payload: SetPinRequest, svc: DriverService = Depends(get_service)
) -> OkResponse:
    await svc.set_pin(driver_id, payload.pin)
    return OkResponse()
