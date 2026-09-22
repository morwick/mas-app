from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from supabase import AsyncClient

from app.core.driver_auth import DriverSession, driver_client, require_driver
from app.core.supabase import SupabaseClientFactory, get_client_factory
from app.modules.auth.schemas import OkResponse
from app.modules.driver_portal.schemas import (
    DriverAcceptResponse,
    DriverJobFilter,
    DriverLoginRequest,
    DriverMeResponse,
    DriverPodRequest,
    DriverSessionResponse,
    DriverUpdateStatusRequest,
    DriverUpdateStatusResponse,
)
from app.modules.driver_portal.service import DriverPortalService
from app.modules.jobs.schemas import Job, JobPhoto, PhotoType

router = APIRouter(prefix="/driver", tags=["driver-portal"])


async def anon_driver_client(
    factory: SupabaseClientFactory = Depends(get_client_factory),
) -> AsyncIterator[AsyncClient]:
    async with factory.for_driver() as client:
        yield client


def get_service(client: AsyncClient = Depends(driver_client)) -> DriverPortalService:
    return DriverPortalService(client)


@router.post("/login", response_model=DriverSessionResponse)
async def driver_login(
    payload: DriverLoginRequest,
    request: Request,
    client: AsyncClient = Depends(anon_driver_client),
) -> DriverSessionResponse:
    return await DriverPortalService(client).login(payload, user_agent=request.headers.get("user-agent"))


@router.post("/logout", response_model=OkResponse)
async def driver_logout(svc: DriverPortalService = Depends(get_service)) -> OkResponse:
    await svc.logout()
    return OkResponse()


@router.get("/me", response_model=DriverMeResponse)
async def driver_me(session: DriverSession = Depends(require_driver)) -> DriverMeResponse:
    return DriverMeResponse(driver_id=session.driver_id, nama=session.nama, no_hp=session.no_hp)


@router.get("/jobs", response_model=list[Job])
async def my_jobs(status: DriverJobFilter = Query("all"), svc: DriverPortalService = Depends(get_service)) -> list[Job]:
    return await svc.my_jobs(status=status)


@router.get("/jobs/{job_id}", response_model=Job)
async def my_job(job_id: str, svc: DriverPortalService = Depends(get_service)) -> Job:
    return await svc.my_job(job_id)


@router.post("/jobs/{job_id}/accept", response_model=DriverAcceptResponse)
async def accept_job(job_id: str, svc: DriverPortalService = Depends(get_service)) -> DriverAcceptResponse:
    return DriverAcceptResponse(accepted_at=await svc.accept(job_id))


@router.post("/jobs/{job_id}/status", response_model=DriverUpdateStatusResponse)
async def update_status(
    job_id: str, payload: DriverUpdateStatusRequest, svc: DriverPortalService = Depends(get_service)
) -> DriverUpdateStatusResponse:
    return DriverUpdateStatusResponse(status=await svc.update_status(job_id, payload.status, payload.notes))


@router.post("/jobs/{job_id}/pod", response_model=OkResponse)
async def submit_pod(
    job_id: str, payload: DriverPodRequest, svc: DriverPortalService = Depends(get_service)
) -> OkResponse:
    await svc.submit_pod(job_id, payload)
    return OkResponse()


@router.post("/jobs/{job_id}/photos", response_model=JobPhoto, status_code=201)
async def upload_photo(
    job_id: str,
    type: PhotoType = Form(...),
    photo: UploadFile = File(...),
    svc: DriverPortalService = Depends(get_service),
) -> JobPhoto:
    data = await photo.read()
    return await svc.upload_photo(job_id=job_id, photo_type=type, data=data, content_type=photo.content_type)
