from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from supabase import AsyncClient

from app.core.driver_auth import DriverSession, driver_client, require_driver
from app.core.paging import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, Page, PageParams
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.modules.auth.schemas import OkResponse
from app.modules.driver_portal.schemas import (
    DeviceRegisterRequest,
    DriverAcceptResponse,
    DriverJobFilter,
    DriverLoginRequest,
    DriverMeResponse,
    DriverNotification,
    DriverSessionResponse,
    DriverUpdateStatusRequest,
    DriverUpdateStatusResponse,
    MarkReadRequest,
)
from app.modules.driver_portal.service import DriverPortalService
from app.modules.jobs.schemas import Job, JobPhoto, PhotoSlotMasukan, PhotoStage, normalisasi_slot
from app.modules.uang_jalan.schemas import DriverRequestInput, JobUangJalan, UangJalanRequest

router = APIRouter(prefix="/driver", tags=["driver-portal"])


async def anon_driver_client(
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> AsyncIterator[AsyncClient]:
    async with factory.for_driver() as client:
        yield client


def get_service(client: AsyncClient = Depends(driver_client)) -> DriverPortalService:
    return DriverPortalService(client)


def driver_page_params(
    page: Annotated[int, Query(ge=1, description="Nomor halaman, mulai dari 1")] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE, description="Baris per halaman")] = DEFAULT_PAGE_SIZE,
) -> PageParams:
    """Seperti `page_params`, tetapi tanpa opsi "semua" (`page_size=-1`).

    Aplikasi driver selalu menggulir bertahap. Membuka jalan untuk menarik
    seluruh baris sekaligus hanya membebani HP dan jaringan di lapangan, dan
    tidak ada layar driver yang membutuhkannya.
    """
    return PageParams(page=page, page_size=page_size)


# ── Sesi ────────────────────────────────────────────────────────────────────


@router.post("/login", response_model=DriverSessionResponse)
async def driver_login(
    payload: DriverLoginRequest,
    request: Request,
    client: AsyncClient = Depends(anon_driver_client),
) -> DriverSessionResponse:
    return await DriverPortalService(client).login(payload, user_agent=request.headers.get("user-agent"))


@router.post("/logout", response_model=OkResponse)
async def driver_logout(
    fcm_token: str | None = Query(None), svc: DriverPortalService = Depends(get_service)
) -> OkResponse:
    await svc.logout(fcm_token=fcm_token)
    return OkResponse()


@router.get("/me", response_model=DriverMeResponse)
async def driver_me(session: DriverSession = Depends(require_driver)) -> DriverMeResponse:
    return DriverMeResponse(driver_id=session.driver_id, nama=session.nama, no_hp=session.no_hp)


@router.post("/devices", response_model=OkResponse)
async def register_device(
    payload: DeviceRegisterRequest, svc: DriverPortalService = Depends(get_service)
) -> OkResponse:
    """Daftarkan token FCM perangkat untuk push notification (FR-MOBILE-05)."""
    await svc.register_device(fcm_token=payload.fcm_token, platform=payload.platform)
    return OkResponse()


# ── Job ─────────────────────────────────────────────────────────────────────


@router.get("/jobs", response_model=list[Job])
async def my_jobs(status: DriverJobFilter = Query("all"), svc: DriverPortalService = Depends(get_service)) -> list[Job]:
    return await svc.my_jobs(status=status)


@router.get("/jobs/page", response_model=Page[Job])
async def my_jobs_page(
    status: DriverJobFilter = Query("all"),
    params: PageParams = Depends(driver_page_params),
    svc: DriverPortalService = Depends(get_service),
) -> Page[Job]:
    """Gulir bertahap di aplikasi driver — penyaringan tab dikerjakan server."""
    return await svc.my_jobs_page(status=status, params=params)


@router.get("/jobs/{job_id}", response_model=Job)
async def my_job(job_id: str, svc: DriverPortalService = Depends(get_service)) -> Job:
    return await svc.my_job(job_id)


@router.post("/jobs/{job_id}/accept", response_model=DriverAcceptResponse)
async def accept_job(job_id: str, svc: DriverPortalService = Depends(get_service)) -> DriverAcceptResponse:
    accepted_at, status = await svc.accept(job_id)
    return DriverAcceptResponse(accepted_at=accepted_at, status=status)


@router.post("/jobs/{job_id}/status", response_model=DriverUpdateStatusResponse)
async def update_status(
    job_id: str, payload: DriverUpdateStatusRequest, svc: DriverPortalService = Depends(get_service)
) -> DriverUpdateStatusResponse:
    return DriverUpdateStatusResponse(status=await svc.update_status(job_id, payload.status, payload.notes))


@router.post("/jobs/{job_id}/photos", response_model=JobPhoto, status_code=201)
async def upload_slot_photo(
    job_id: str,
    stage: PhotoStage = Form(...),
    slot: PhotoSlotMasukan = Form(...),
    photo: UploadFile = File(...),
    taken_at: str | None = Form(None, description="ISO 8601 saat foto diambil"),
    lat: float | None = Form(None),
    lng: float | None = Form(None),
    svc: DriverPortalService = Depends(get_service),
) -> JobPhoto:
    """Unggah/ganti foto pada satu slot tahap (FR-PHOTO-01..06)."""
    data = await photo.read()
    return await svc.upload_slot_photo(
        job_id=job_id,
        stage=stage,
        slot=normalisasi_slot(slot),
        data=data,
        content_type=photo.content_type,
        taken_at=taken_at,
        lat=lat,
        lng=lng,
    )


# ── Uang jalan ──────────────────────────────────────────────────────────────


@router.get("/jobs/{job_id}/uang-jalan", response_model=JobUangJalan)
async def job_uang_jalan(job_id: str, svc: DriverPortalService = Depends(get_service)) -> JobUangJalan:
    return await svc.uang_jalan(job_id)


@router.post("/jobs/{job_id}/uang-jalan/ajukan", response_model=UangJalanRequest, status_code=201)
async def request_uang_jalan(
    job_id: str, payload: DriverRequestInput, svc: DriverPortalService = Depends(get_service)
) -> UangJalanRequest:
    """BR-05: ajukan uang jalan (nominal ≤ sisa pagu)."""
    return await svc.request_uang_jalan(job_id, nominal=payload.nominal, catatan=payload.catatan)


# ── Notifikasi ──────────────────────────────────────────────────────────────


@router.get("/notifications", response_model=list[DriverNotification])
async def notifications(svc: DriverPortalService = Depends(get_service)) -> list[DriverNotification]:
    return await svc.notifications()


@router.get("/notifications/page", response_model=Page[DriverNotification])
async def notifications_page(
    params: PageParams = Depends(driver_page_params),
    svc: DriverPortalService = Depends(get_service),
) -> Page[DriverNotification]:
    return await svc.notifications_page(params=params)


@router.post("/notifications/read", response_model=OkResponse)
async def mark_read(payload: MarkReadRequest, svc: DriverPortalService = Depends(get_service)) -> OkResponse:
    await svc.mark_read(payload.ids)
    return OkResponse()
